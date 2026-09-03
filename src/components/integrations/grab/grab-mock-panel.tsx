/**
 * Grab Mock Panel Component
 * 
 * UI for Grab mock integration demo:
 * - Button to simulate new order
 * - Toggle store online/offline status
 * - Display last sync info
 * - Badge showing MOCK/DEMO mode
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toggleGrabOnlineStatus, manualSyncGrabMenu } from "@/server/actions/grab";

interface GrabMockPanelProps {
  organizationId: string;
  branchId: string;
  salesChannelId: string;
}

export function GrabMockPanel({ organizationId, branchId, salesChannelId }: GrabMockPanelProps) {
  const [isOnline, setIsOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastOrderTime, setLastOrderTime] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Toggle online status
  const handleToggleOnline = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const result = await toggleGrabOnlineStatus(organizationId, { isOnline: !isOnline });

      if (result.ok) {
        setIsOnline(!isOnline);
        setMessage({
          type: "success",
          text: !isOnline ? "Cửa hàng đã bật nhận đơn Grab" : "Cửa hàng đã tắt nhận đơn Grab",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error?.message || "Không thể cập nhật trạng thái",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "Lỗi: " + (error instanceof Error ? error.message : String(error)),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate new order
  const handleSimulateOrder = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/integrations/grab/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          branchId,
          salesChannelId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage({
          type: "error",
          text: result.error || "Lỗi tạo đơn mock",
        });
        return;
      }

      setLastOrderTime(new Date().toLocaleTimeString("vi-VN"));
      setMessage({
        type: "success",
        text: `Đã tạo đơn Grab từ ${result.order.customerName} (${result.order.itemCount} món, ${(result.order.totalAmount / 1000).toFixed(0)}K)`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: "Lỗi: " + (error instanceof Error ? error.message : String(error)),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Manual menu sync
  const handleMenuSync = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const result = await manualSyncGrabMenu(organizationId, {});

      if (result.ok) {
        setMessage({
          type: "success",
          text: `Đã đồng bộ ${result.data.itemsSynced} món menu`,
        });
      } else {
        setMessage({
          type: "error",
          text: result.error?.message || "Không thể đồng bộ menu",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "Lỗi: " + (error instanceof Error ? error.message : String(error)),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Grab Delivery (Mock)</CardTitle>
            <CardDescription>Mô phỏng tích hợp Grab cho mục đích đồ án</CardDescription>
          </div>
          <Badge variant="secondary">Mock/Demo</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status section */}
        <div className="rounded-lg bg-muted p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Trạng thái cửa hàng</h3>
              <p className="text-xs text-muted-foreground">
                {isOnline ? (
                  <span className="text-green-700 font-semibold">Đang nhận đơn</span>
                ) : (
                  <span className="text-red-700 font-semibold">Không nhận đơn</span>
                )}
              </p>
            </div>
            <Button
              onClick={handleToggleOnline}
              disabled={isLoading}
              variant={isOnline ? "destructive" : "default"}
              size="sm"
            >
              {isOnline ? "Tắt nhận đơn" : "Bật nhận đơn"}
            </Button>
          </div>

          {lastOrderTime && (
            <p className="text-xs text-muted-foreground">Đơn cuối: {lastOrderTime}</p>
          )}
        </div>

        {/* Demo buttons section */}
        <div className="space-y-2">
          <Button
            onClick={handleSimulateOrder}
            disabled={isLoading || !isOnline}
            className="w-full"
            size="sm"
          >
            {isLoading ? "Đang xử lý..." : "Tạo đơn Grab mới (Mock)"}
          </Button>

          <Button
            onClick={handleMenuSync}
            disabled={isLoading}
            variant="outline"
            className="w-full"
            size="sm"
          >
            {isLoading ? "Đang đồng bộ..." : "Đồng bộ menu"}
          </Button>
        </div>

        {/* Message display */}
        {message && (
          <div
            className={`rounded-lg p-3 text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Info section */}
        <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Ghi chú:</strong> Đây là môi trường mô phỏng (Mock) cho mục đích demo đồ án.
          </p>
          <p>
            Không có kết nối thực tế đến Grab. Toàn bộ dữ liệu xử lý nội bộ trong hệ thống.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
