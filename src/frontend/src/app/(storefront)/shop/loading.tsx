import { ShopPageShimmer } from "@/components/ui/page-shimmers";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <ShopPageShimmer />
    </div>
  );
}
