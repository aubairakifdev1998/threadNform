"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminListPagination } from "@/components/admin/admin-list-pagination";
import { AdminSelect } from "@/components/admin/admin-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PriceDisplay } from "@/components/ui/price";
import { EmptyState } from "@/components/ui/data-states";
import {
  ActiveBadge,
  PaymentStatusBadge,
} from "@/components/status/status-badges";
import { Receipt } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import {
  errorMessage,
  useAdminMutation,
  useBankAccounts,
  useErrorToast,
  usePaymentQueue,
} from "@/lib/query/admin";
import { cn } from "@/lib/utils";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";

type Proof = {
  id: string;
  mime: string;
  sizeBytes: number;
  amountClaimedPence: number | null;
  customerReference: string | null;
  customerNote: string | null;
  status: string;
  uploadedAt: string;
  url: string | null;
  isImage: boolean;
};

type PaymentQueueItem = {
  id: string;
  orderId: string;
  orderNumber: string;
  email: string;
  status: string;
  amountDuePence: number;
  amountClaimedPence: number | null;
  customerReference?: string | null;
  proofCount: number;
  proofs: Proof[];
};

type BankAccount = {
  id: string;
  bankName: string;
  accountName: string;
  sortCode: string;
  accountNumber: string;
  iban: string | null;
  referenceInstructions: string;
  isActive: boolean;
};

const emptyBank = {
  bankName: "",
  accountName: "",
  sortCode: "",
  accountNumber: "",
  iban: "",
  referenceInstructions: "Use your order number as the payment reference.",
  isActive: true,
};

const STATUS_OPTIONS = [
  { value: "queue", label: "Needs review" },
  { value: "all", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "PROOF_SUBMITTED", label: "Proof submitted" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "VERIFIED", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
] as const;

const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

const REVIEWABLE = new Set(["PROOF_SUBMITTED", "UNDER_REVIEW"]);

export function AdminPaymentsPanel() {
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [bankForm, setBankForm] = useState(emptyBank);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState("queue");
  const [hasProof, setHasProof] = useState<"all" | "true" | "false">("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const queue = usePaymentQueue({
    page,
    pageSize,
    status,
    q: search || undefined,
    hasProof,
  });
  useErrorToast(queue.error, "Failed to load payments");
  const items: PaymentQueueItem[] = queue.isError ? [] : (queue.data?.items ?? []);
  const total = queue.isError ? 0 : (queue.data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const bankQuery = useBankAccounts();
  // Bank details are OWNER-only; other roles get a 403 from the API.
  const bankOwnerOnly =
    bankQuery.error instanceof ApiError && bankQuery.error.status === 403;
  useErrorToast(bankQuery.error, "Failed to load bank accounts", {
    ignoreStatus: 403,
  });
  const banks: BankAccount[] = bankQuery.data ?? [];

  const approveMutation = useAdminMutation((token, id: string) =>
    adminApi.approvePayment(token, id, crypto.randomUUID()),
  );
  const rejectMutation = useAdminMutation(
    (token, vars: { id: string; reason: string }) =>
      adminApi.rejectPayment(token, vars.id, vars.reason),
  );
  const saveBankMutation = useAdminMutation(
    (token, body: Parameters<typeof adminApi.upsertBankAccount>[1]) =>
      adminApi.upsertBankAccount(token, body),
  );
  const activateBankMutation = useAdminMutation((token, id: string) =>
    adminApi.activateBankAccount(token, id),
  );

  async function approve(id: string) {
    try {
      await approveMutation.mutateAsync(id);
      toast.success("Payment approved — order confirmed");
    } catch (error) {
      toast.error(errorMessage(error, "Approve failed"));
    }
  }

  async function reject(id: string) {
    const reason = rejectReason[id]?.trim();
    if (!reason) {
      toast.error("Provide a rejection reason");
      return;
    }
    try {
      await rejectMutation.mutateAsync({ id, reason });
      toast.success("Payment rejected — customer can re-upload proof");
    } catch (error) {
      toast.error(errorMessage(error, "Reject failed"));
    }
  }

  async function activateBank(id: string) {
    try {
      await activateBankMutation.mutateAsync(id);
      toast.success("Bank account activated");
    } catch (error) {
      toast.error(errorMessage(error, "Unable to activate bank account"));
    }
  }

  async function saveBank() {
    if (
      !bankForm.bankName.trim() ||
      !bankForm.accountName.trim() ||
      !bankForm.sortCode.trim() ||
      !bankForm.accountNumber.trim()
    ) {
      toast.error(
        "Bank name, account name, sort code and account number are required",
      );
      return;
    }
    try {
      await saveBankMutation.mutateAsync({
        id: editingBankId ?? undefined,
        bankName: bankForm.bankName.trim(),
        accountName: bankForm.accountName.trim(),
        sortCode: bankForm.sortCode.trim(),
        accountNumber: bankForm.accountNumber.trim(),
        iban: bankForm.iban.trim() || null,
        referenceInstructions: bankForm.referenceInstructions.trim(),
        isActive: bankForm.isActive,
      });
      toast.success(
        editingBankId ? "Bank details updated" : "Bank details saved",
      );
      setBankForm(emptyBank);
      setEditingBankId(null);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to save bank details"));
    }
  }

  function applySearch() {
    setPage(1);
    setSearch(searchDraft.trim());
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Payments"
        description="Filter and page through orders with payment proofs. Approve after checking evidence — or reject so the customer can re-upload."
      />

      <Card>
        <CardHeader>
          <CardTitle>Bank details</CardTitle>
          <CardDescription>
            Active account details are shown on the customer order page after
            checkout.
          </CardDescription>
        </CardHeader>
        {bankOwnerOnly ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Only the store owner can view or change the bank account customers
              pay into.
            </p>
          </CardContent>
        ) : (
          <>
            <CardContent className="space-y-4">
              {banks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No bank accounts yet. Add one below so customers can pay.
                </p>
              ) : (
                <ul className="divide-y divide-border border border-border">
                  {banks.map((bank) => (
                    <li
                      key={bank.id}
                      className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {bank.accountName}{" "}
                          <ActiveBadge
                            isActive={bank.isActive}
                            className="ml-2"
                          />
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {bank.bankName} · {bank.sortCode} ·{" "}
                          {bank.accountNumber}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingBankId(bank.id);
                            setBankForm({
                              bankName: bank.bankName,
                              accountName: bank.accountName,
                              sortCode: bank.sortCode,
                              accountNumber: bank.accountNumber,
                              iban: bank.iban ?? "",
                              referenceInstructions: bank.referenceInstructions,
                              isActive: bank.isActive,
                            });
                          }}
                        >
                          Edit
                        </Button>
                        {!bank.isActive ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={activateBankMutation.isPending}
                            onClick={() => void activateBank(bank.id)}
                          >
                            Activate
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                <h3 className="text-sm font-medium sm:col-span-2">
                  {editingBankId ? "Edit bank account" : "Add bank account"}
                </h3>
                {(
                  [
                    ["bankName", "Bank name"],
                    ["accountName", "Account name"],
                    ["sortCode", "Sort code"],
                    ["accountNumber", "Account number"],
                    ["iban", "IBAN (optional)"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <Input
                      value={bankForm[key]}
                      onChange={(e) =>
                        setBankForm((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
                <div className="space-y-2 sm:col-span-2">
                  <Label>Reference instructions</Label>
                  <Textarea
                    rows={2}
                    value={bankForm.referenceInstructions}
                    onChange={(e) =>
                      setBankForm((prev) => ({
                        ...prev,
                        referenceInstructions: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch
                    checked={bankForm.isActive}
                    onCheckedChange={(checked) =>
                      setBankForm((prev) => ({ ...prev, isActive: checked }))
                    }
                  />
                  <Label>Set as active account for checkout</Label>
                </div>
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button
                type="button"
                disabled={saveBankMutation.isPending}
                onClick={() => void saveBank()}
              >
                {saveBankMutation.isPending
                  ? "Saving…"
                  : editingBankId
                    ? "Update bank details"
                    : "Save bank details"}
              </Button>
              {editingBankId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingBankId(null);
                    setBankForm(emptyBank);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </CardFooter>
          </>
        )}
      </Card>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Payment proofs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every proof file for each order. Filter by status, evidence, or
            search — then approve from the evidence.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="pay-status">Status</Label>
              <AdminSelect
                id="pay-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-proof">Evidence</Label>
              <AdminSelect
                id="pay-proof"
                value={hasProof}
                onChange={(e) => {
                  setHasProof(e.target.value as "all" | "true" | "false");
                  setPage(1);
                }}
              >
                <option value="all">All</option>
                <option value="true">With proof</option>
                <option value="false">Without proof</option>
              </AdminSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-page-size">Per page</Label>
              <AdminSelect
                id="pay-page-size"
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="pay-search">Search</Label>
              <div className="flex gap-2">
                <Input
                  id="pay-search"
                  placeholder="Order # or email"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applySearch();
                  }}
                />
                <Button type="button" variant="outline" onClick={applySearch}>
                  Go
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {queue.isPending ? (
          <ListBlockShimmer rows={4} />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              icon={Receipt}
              title="No payments match these filters"
              description="Try another status, evidence filter, or search term."
              className="py-12"
            />
          </Card>
        ) : (
          <div
            aria-busy={queue.isPlaceholderData}
            className={cn(
              "grid gap-4 transition-opacity",
              queue.isPlaceholderData && "opacity-60",
            )}
          >
            {items.map((item) => {
              const canReview = REVIEWABLE.has(item.status);
              return (
                <Card key={item.id}>
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="text-base">
                        <Link
                          href={`/admin/orders?review=${item.orderId}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {item.orderNumber}
                        </Link>
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.email}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <PaymentStatusBadge status={item.status} />
                        <Badge variant="outline">
                          {item.proofCount} proof
                          {item.proofCount === 1 ? "" : "s"}
                        </Badge>
                        {item.customerReference ? (
                          <Badge variant="outline">
                            Ref {item.customerReference}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right">
                      <PriceDisplay
                        pence={
                          item.amountClaimedPence ?? item.amountDuePence ?? 0
                        }
                        size="md"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Due{" "}
                        <PriceDisplay
                          pence={item.amountDuePence}
                          size="sm"
                          className="text-muted-foreground"
                        />
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm font-medium">
                      Evidence ({item.proofs.length})
                    </p>
                    {item.proofs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No proof files attached for this order.
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {item.proofs.map((proof, index) => (
                          <div
                            key={proof.id}
                            className="overflow-hidden rounded-md border border-border bg-muted/20"
                          >
                            {proof.url && proof.isImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={proof.url}
                                alt={`Payment proof ${index + 1}`}
                                className="max-h-56 w-full object-contain bg-background"
                              />
                            ) : (
                              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                                {proof.mime || "File"}
                              </div>
                            )}
                            <div className="space-y-1 border-t border-border p-3 text-xs text-muted-foreground">
                              <p className="font-medium text-foreground">
                                Proof {index + 1} of {item.proofs.length}
                              </p>
                              {proof.customerReference ? (
                                <p>Customer ref: {proof.customerReference}</p>
                              ) : null}
                              {proof.customerNote ? (
                                <p>Note: {proof.customerNote}</p>
                              ) : null}
                              {proof.amountClaimedPence != null ? (
                                <p>
                                  Claimed{" "}
                                  <PriceDisplay
                                    pence={proof.amountClaimedPence}
                                    size="sm"
                                  />
                                </p>
                              ) : null}
                              <p>
                                Uploaded{" "}
                                {new Date(proof.uploadedAt).toLocaleString(
                                  "en-GB",
                                )}
                              </p>
                              {proof.url ? (
                                <a
                                  href={proof.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(
                                    buttonVariants({
                                      variant: "outline",
                                      size: "sm",
                                    }),
                                    "mt-1",
                                  )}
                                >
                                  Open evidence
                                </a>
                              ) : (
                                <p>Signed URL unavailable</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex flex-wrap items-center gap-2">
                    {canReview ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            item.proofs.length === 0 || approveMutation.isPending
                          }
                          onClick={() => void approve(item.id)}
                        >
                          Approve & confirm order
                        </Button>
                        <Input
                          placeholder="Reject reason"
                          className="max-w-xs"
                          value={rejectReason[item.id] ?? ""}
                          onChange={(e) =>
                            setRejectReason((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            item.proofs.length === 0 || rejectMutation.isPending
                          }
                          onClick={() => void reject(item.id)}
                        >
                          Reject
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {item.status === "VERIFIED"
                          ? "Payment already verified."
                          : item.status === "REJECTED"
                            ? "Rejected — waiting for a new proof upload."
                            : "No review actions for this status."}
                      </p>
                    )}
                    <Link
                      href={`/admin/orders?review=${item.orderId}`}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                      )}
                    >
                      Open order review
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        {!queue.isPending && total > 0 ? (
          <AdminListPagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        ) : null}
      </div>
    </div>
  );
}
