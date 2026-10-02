-- Reference-scoped inventory holds + one price row per product/variant.
--
-- Before this migration release_inventory / fulfill_inventory only checked the
-- aggregate `reserved` column, so releasing a hold that a cart or order never
-- took silently consumed stock reserved by *other* carts/orders. Every hold is
-- now derived from the movement ledger for its (reference_type, reference_id),
-- and callers can only release or consume what that reference actually holds.
--
-- Safe to re-run: functions use CREATE OR REPLACE, indexes IF NOT EXISTS.

create index if not exists inventory_movements_hold_idx
  on public.inventory_movements (warehouse_id, variant_id, reference_type, reference_id);

-- Quantity currently held by one reference. Reservations add, releases and
-- fulfilments subtract. Never negative.
create or replace function public.inventory_hold_qty(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_reference_type text,
  p_reference_id uuid
) returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(coalesce(sum(quantity_delta), 0), 0)::int
  from public.inventory_movements
  where warehouse_id = p_warehouse_id
    and variant_id = p_variant_id
    and reference_type = p_reference_type
    and reference_id = p_reference_id
    and movement_type in ('ORDER_RESERVATION', 'ORDER_RELEASE', 'ORDER_FULFILLMENT');
$$;

-- Moves the hold for one reference to exactly p_target units.
-- Raises INSUFFICIENT_STOCK when growing the hold beyond what is free.
create or replace function public.set_inventory_hold(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_reference_type text,
  p_reference_id uuid,
  p_target int,
  p_actor_type public.actor_type default 'SYSTEM',
  p_actor_id uuid default null,
  p_reason text default null
) returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_hold int;
  v_delta int;
  v_free int;
begin
  if p_target is null or p_target < 0 then
    raise exception 'Hold quantity must be zero or positive';
  end if;

  if p_target > 0 then
    perform public.ensure_inventory_item(p_warehouse_id, p_variant_id);
  end if;

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  if v_item.id is null then
    return v_item;
  end if;

  v_hold := public.inventory_hold_qty(
    p_warehouse_id, p_variant_id, p_reference_type, p_reference_id
  );
  v_delta := p_target - v_hold;

  if v_delta > 0 then
    v_free := v_item.on_hand - v_item.reserved;
    if v_free < v_delta then
      raise exception 'INSUFFICIENT_STOCK: available %, requested %',
        v_free + v_hold, p_target;
    end if;

    update public.inventory_items
    set reserved = reserved + v_delta, updated_at = now()
    where id = v_item.id
    returning * into v_item;

    insert into public.inventory_movements (
      warehouse_id, variant_id, quantity_delta, movement_type,
      reference_type, reference_id,
      previous_on_hand, new_on_hand, previous_reserved, new_reserved,
      actor_type, actor_id, reason
    ) values (
      p_warehouse_id, p_variant_id, v_delta, 'ORDER_RESERVATION',
      p_reference_type, p_reference_id,
      v_item.on_hand, v_item.on_hand, v_item.reserved - v_delta, v_item.reserved,
      p_actor_type, p_actor_id, p_reason
    );
  elsif v_delta < 0 then
    -- Clamp to the aggregate so legacy drift can never violate reserved >= 0.
    v_delta := -least(-v_delta, v_item.reserved);
    if v_delta = 0 then
      return v_item;
    end if;

    update public.inventory_items
    set reserved = reserved + v_delta, updated_at = now()
    where id = v_item.id
    returning * into v_item;

    insert into public.inventory_movements (
      warehouse_id, variant_id, quantity_delta, movement_type,
      reference_type, reference_id,
      previous_on_hand, new_on_hand, previous_reserved, new_reserved,
      actor_type, actor_id, reason
    ) values (
      p_warehouse_id, p_variant_id, v_delta, 'ORDER_RELEASE',
      p_reference_type, p_reference_id,
      v_item.on_hand, v_item.on_hand, v_item.reserved - v_delta, v_item.reserved,
      p_actor_type, p_actor_id, p_reason
    );
  end if;

  return v_item;
end;
$$;

-- Releases up to p_qty of the reference's own hold. Releasing a hold that does
-- not exist is a no-op (returns the row unchanged, or NULL when no row).
create or replace function public.release_inventory(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_qty int,
  p_reference_type text,
  p_reference_id uuid,
  p_actor_type public.actor_type default 'SYSTEM',
  p_actor_id uuid default null,
  p_reason text default null
) returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_hold int;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  if v_item.id is null then
    return v_item;
  end if;

  v_hold := public.inventory_hold_qty(
    p_warehouse_id, p_variant_id, p_reference_type, p_reference_id
  );

  return public.set_inventory_hold(
    p_warehouse_id, p_variant_id, p_reference_type, p_reference_id,
    greatest(v_hold - p_qty, 0), p_actor_type, p_actor_id, p_reason
  );
end;
$$;

-- Ships p_qty units for a reference: on_hand drops by p_qty and the
-- reference's own hold is consumed first. Any unheld remainder must come from
-- free stock, so other references' holds are never touched.
create or replace function public.fulfill_inventory(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_qty int,
  p_reference_type text,
  p_reference_id uuid,
  p_actor_type public.actor_type default 'SYSTEM',
  p_actor_id uuid default null,
  p_reason text default null
) returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_hold int;
  v_consume int;
  v_prev_on_hand int;
  v_prev_reserved int;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  if v_item.id is null then
    raise exception 'INSUFFICIENT_STOCK: available %, requested %', 0, p_qty;
  end if;

  v_hold := public.inventory_hold_qty(
    p_warehouse_id, p_variant_id, p_reference_type, p_reference_id
  );
  v_consume := least(v_hold, p_qty, v_item.reserved);

  if v_item.on_hand - p_qty < v_item.reserved - v_consume then
    raise exception 'INSUFFICIENT_STOCK: available %, requested %',
      v_item.on_hand - v_item.reserved + v_consume, p_qty;
  end if;

  v_prev_on_hand := v_item.on_hand;
  v_prev_reserved := v_item.reserved;

  update public.inventory_items
  set on_hand = on_hand - p_qty,
      reserved = reserved - v_consume,
      updated_at = now()
  where id = v_item.id
  returning * into v_item;

  insert into public.inventory_movements (
    warehouse_id, variant_id, quantity_delta, movement_type,
    reference_type, reference_id,
    previous_on_hand, new_on_hand, previous_reserved, new_reserved,
    actor_type, actor_id, reason
  ) values (
    p_warehouse_id, p_variant_id, -p_qty, 'ORDER_FULFILLMENT',
    p_reference_type, p_reference_id,
    v_prev_on_hand, v_item.on_hand, v_prev_reserved, v_item.reserved,
    p_actor_type, p_actor_id, p_reason
  );

  return v_item;
end;
$$;

-- One proof row per uploaded object: retried submissions are idempotent.
-- Skipped (the API still de-duplicates) if historical duplicates exist.
do $$
begin
  if not exists (
    select 1 from public.payment_proofs
    group by payment_id, storage_path
    having count(*) > 1
  ) then
    create unique index if not exists payment_proofs_payment_path_uidx
      on public.payment_proofs (payment_id, storage_path);
  end if;
end;
$$;

-- One price row per product (variant_id null) / variant.
-- Price edits used to INSERT a new row each time while readers took an
-- arbitrary row, so admin price changes did not reliably reach the shop.
-- Keep the most recently written row (the admin's latest edit) and enforce
-- uniqueness so the API now updates in place. Orders snapshot their prices,
-- so removing superseded rows does not alter any placed order.
delete from public.product_prices p
using (
  select id,
         row_number() over (
           partition by product_id, variant_id
           order by updated_at desc, created_at desc, id desc
         ) as rn
  from public.product_prices
) ranked
where p.id = ranked.id and ranked.rn > 1;

create unique index if not exists product_prices_scope_uidx
  on public.product_prices (
    product_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
