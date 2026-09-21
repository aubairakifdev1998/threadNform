-- Atomic inventory + order number RPCs (called via supabase.rpc)

create or replace function public.allocate_order_number(p_year int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  insert into public.order_number_sequences (year, last_value)
  values (p_year, 1)
  on conflict (year) do update
    set last_value = public.order_number_sequences.last_value + 1
  returning last_value into v_next;

  return 'ORD-' || p_year::text || '-' || lpad(v_next::text, 6, '0');
end;
$$;

create or replace function public.ensure_inventory_item(
  p_warehouse_id uuid,
  p_variant_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  if v_id is null then
    insert into public.inventory_items (warehouse_id, variant_id, on_hand, reserved)
    values (p_warehouse_id, p_variant_id, 0, 0)
    returning id into v_id;

    select id into v_id
    from public.inventory_items
    where id = v_id
    for update;
  end if;

  return v_id;
end;
$$;

create or replace function public.reserve_inventory(
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
  v_available int;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  perform public.ensure_inventory_item(p_warehouse_id, p_variant_id);

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  v_available := v_item.on_hand - v_item.reserved;
  if v_available < p_qty then
    raise exception 'INSUFFICIENT_STOCK: available %, requested %', v_available, p_qty;
  end if;

  update public.inventory_items
  set reserved = reserved + p_qty, updated_at = now()
  where id = v_item.id
  returning * into v_item;

  insert into public.inventory_movements (
    warehouse_id, variant_id, quantity_delta, movement_type,
    reference_type, reference_id,
    previous_on_hand, new_on_hand, previous_reserved, new_reserved,
    actor_type, actor_id, reason
  ) values (
    p_warehouse_id, p_variant_id, p_qty, 'ORDER_RESERVATION',
    p_reference_type, p_reference_id,
    v_item.on_hand, v_item.on_hand, v_item.reserved - p_qty, v_item.reserved,
    p_actor_type, p_actor_id, p_reason
  );

  return v_item;
end;
$$;

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
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  if v_item is null then
    raise exception 'Inventory item not found';
  end if;

  if v_item.reserved < p_qty then
    raise exception 'Cannot release more than reserved';
  end if;

  update public.inventory_items
  set reserved = reserved - p_qty, updated_at = now()
  where id = v_item.id
  returning * into v_item;

  insert into public.inventory_movements (
    warehouse_id, variant_id, quantity_delta, movement_type,
    reference_type, reference_id,
    previous_on_hand, new_on_hand, previous_reserved, new_reserved,
    actor_type, actor_id, reason
  ) values (
    p_warehouse_id, p_variant_id, -p_qty, 'ORDER_RELEASE',
    p_reference_type, p_reference_id,
    v_item.on_hand, v_item.on_hand, v_item.reserved + p_qty, v_item.reserved,
    p_actor_type, p_actor_id, p_reason
  );

  return v_item;
end;
$$;

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

  if v_item is null then
    raise exception 'Inventory item not found';
  end if;

  if v_item.reserved < p_qty or v_item.on_hand < p_qty then
    raise exception 'Cannot fulfill: insufficient on_hand/reserved';
  end if;

  v_prev_on_hand := v_item.on_hand;
  v_prev_reserved := v_item.reserved;

  update public.inventory_items
  set on_hand = on_hand - p_qty,
      reserved = reserved - p_qty,
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

create or replace function public.adjust_inventory(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_on_hand_delta int,
  p_movement_type public.inventory_movement_type,
  p_actor_type public.actor_type default 'ADMIN',
  p_actor_id uuid default null,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null
) returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_prev_on_hand int;
  v_new_on_hand int;
begin
  perform public.ensure_inventory_item(p_warehouse_id, p_variant_id);

  select * into v_item
  from public.inventory_items
  where warehouse_id = p_warehouse_id and variant_id = p_variant_id
  for update;

  v_prev_on_hand := v_item.on_hand;
  v_new_on_hand := v_prev_on_hand + p_on_hand_delta;

  if v_new_on_hand < v_item.reserved then
    raise exception 'Adjustment would make on_hand < reserved';
  end if;
  if v_new_on_hand < 0 then
    raise exception 'Adjustment would make on_hand negative';
  end if;

  update public.inventory_items
  set on_hand = v_new_on_hand, updated_at = now()
  where id = v_item.id
  returning * into v_item;

  insert into public.inventory_movements (
    warehouse_id, variant_id, quantity_delta, movement_type,
    reference_type, reference_id,
    previous_on_hand, new_on_hand, previous_reserved, new_reserved,
    actor_type, actor_id, reason
  ) values (
    p_warehouse_id, p_variant_id, p_on_hand_delta, p_movement_type,
    p_reference_type, p_reference_id,
    v_prev_on_hand, v_item.on_hand, v_item.reserved, v_item.reserved,
    p_actor_type, p_actor_id, p_reason
  );

  return v_item;
end;
$$;
