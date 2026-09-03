// src/app/my-orders/[id]/page.tsx
import OrderDetailClient from "@/src/components/orders/OrderDetailClient";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <OrderDetailClient orderId={id} />;
}
