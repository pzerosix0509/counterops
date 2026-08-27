"use client";
import * as React from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Boxes,
  Bot,
  Check,
  ChefHat,
  Plus,
  RotateCcw,
  ShoppingCart,
  Table2,
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils/format";
import { formatVND } from "@/lib/date/ranges";
import {
  DEMO_AI_ANSWER,
  DEMO_AI_QUESTION,
  DEMO_BEST_SELLER,
  DEMO_DASHBOARD,
  DEMO_INVENTORY,
  DEMO_KITCHEN,
  DEMO_MENU,
  DEMO_NEW_DISH,
  DEMO_ORDER,
  DEMO_REVENUE,
  DEMO_TABLES,
  EASE,
  FEATURES,
  MOTION,
} from "./feature-data";
import { useFeatureDemo } from "./feature-demo-context";

const screenVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: MOTION.entranceMs / 1000, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: MOTION.exitMs / 1000, ease: EASE } },
};

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: MOTION.staggerMs / 1000 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: MOTION.entranceMs / 1000, ease: EASE } },
};

function OrderScreen({ reduced }: { reduced: boolean }) {
  const [paid, setPaid] = React.useState(reduced);
  React.useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => setPaid(true), 850);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  const total = DEMO_ORDER.items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <ShoppingCart className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">Bán hàng POS · {DEMO_ORDER.table}</CardTitle>
              <CardDescription className="text-xs">Cập nhật realtime từ hệ thống</CardDescription>
            </div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {paid ? (
              <motion.div
                key="paid"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                <Badge variant="success">Đã thanh toán</Badge>
              </motion.div>
            ) : (
              <motion.div
                key="serving"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
              >
                <Badge variant="info">Đang phục vụ</Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CardHeader>
      <CardContent>
        <motion.div variants={listVariants} initial="hidden" animate="show" className="flex flex-col gap-2">
          {DEMO_ORDER.items.map((item) => (
            <motion.div
              key={item.name}
              variants={itemVariants}
              className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground">×{item.qty}</span>
              </div>
              <span className="text-sm font-medium">{formatVND(item.price * item.qty)}</span>
            </motion.div>
          ))}
          <motion.div
            variants={itemVariants}
            className="mt-1 flex items-center justify-between rounded-md bg-primary/10 px-3 py-2"
          >
            <span className="text-sm font-medium">Tổng cộng</span>
            <span className="text-sm font-semibold">{formatVND(total)}</span>
          </motion.div>
        </motion.div>
      </CardContent>
    </Card>
  );
}

function KitchenScreen({ reduced }: { reduced: boolean }) {
  const [done, setDone] = React.useState(reduced);
  React.useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => setDone(true), 800);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  const cooking = DEMO_KITCHEN.length - (done ? 1 : 0);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <ChefHat className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">Bảng bếp · Realtime</CardTitle>
              <CardDescription className="text-xs">Món mới hiện ngay cho khu bếp</CardDescription>
            </div>
          </div>
          <Badge variant="warning">{cooking} món đang làm</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <motion.div variants={listVariants} initial="hidden" animate="show" className="grid gap-2 sm:grid-cols-2">
          {DEMO_KITCHEN.map((ticket, index) => {
            const isDone = done && index === 0;
            return (
              <motion.div
                key={ticket.table + ticket.item}
                variants={itemVariants}
                className="rounded-md border bg-muted/20 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{ticket.table}</span>
                  <AnimatePresence mode="wait" initial={false}>
                    {isDone ? (
                      <motion.div
                        key="done"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.25, ease: EASE }}
                      >
                        <Badge variant="success">
                          <Check className="h-3 w-3" />
                          Hoàn tất
                        </Badge>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="cooking"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: EASE }}
                      >
                        <Badge variant="warning">Đang làm</Badge>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <p className="mt-1 text-sm font-medium">
                  {ticket.item} ×{ticket.qty}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </CardContent>
    </Card>
  );
}

const TABLE_STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "outline"> = {
  "Trống": "success",
  "Có khách": "warning",
  "Đặt trước": "info",
  "Tạm khóa": "outline",
};

function TablesScreen() {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <Table2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">Quản lý bàn / phòng</CardTitle>
              <CardDescription className="text-xs">Khu trong nhà · 6 bàn</CardDescription>
            </div>
          </div>
          <Badge variant="info">Đặt trước: Bàn 3</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <motion.div variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DEMO_TABLES.map((table) => (
            <motion.div
              key={table.name}
              variants={itemVariants}
              className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2"
            >
              <span className="text-sm font-medium">{table.name}</span>
              <Badge variant={TABLE_STATUS_VARIANT[table.status]} className="whitespace-nowrap">
                {table.status}
              </Badge>
            </motion.div>
          ))}
        </motion.div>
      </CardContent>
    </Card>
  );
}

function MenuScreen() {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <UtensilsCrossed className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">Thực đơn</CardTitle>
              <CardDescription className="text-xs">Cập nhật một lần, đồng bộ mọi thiết bị</CardDescription>
            </div>
          </div>
          <Badge variant="success">Món mới: {DEMO_NEW_DISH.name}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <motion.div variants={listVariants} initial="hidden" animate="show" className="flex flex-col gap-2">
          {DEMO_MENU.map((dish) => (
            <motion.div
              key={dish.name}
              variants={itemVariants}
              className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{dish.name}</p>
                <p className="text-xs text-muted-foreground">{dish.category}</p>
              </div>
              <span className="text-sm font-medium">{formatVND(dish.price)}</span>
            </motion.div>
          ))}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: MOTION.entranceMs / 1000, delay: 0.4, ease: EASE }}
          className="rounded-md border bg-primary/[0.03] p-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="success">Mới</Badge>
              <span className="text-sm font-medium">{DEMO_NEW_DISH.name}</span>
            </div>
            <span className="text-sm font-semibold">{formatVND(DEMO_NEW_DISH.price)}</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Input placeholder="Tên món mới..." className="h-8 text-sm" />
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Lưu
            </Button>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
}

function InventoryScreen() {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <Boxes className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">Kho hàng</CardTitle>
              <CardDescription className="text-xs">Tự động trừ tồn khi bán</CardDescription>
            </div>
          </div>
          <Badge variant="danger">Hết hàng: Bột chiên</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <motion.div variants={itemVariants} initial="hidden" animate="show">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nguyên liệu</TableHead>
                <TableHead>Tồn kho</TableHead>
                <TableHead className="text-right">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEMO_INVENTORY.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.stock}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={row.variant} className="whitespace-nowrap">
                      {row.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </motion.div>
      </CardContent>
    </Card>
  );
}

function useCountUp(target: number, enabled: boolean, durationMs = 900) {
  const [value, setValue] = React.useState(target);
  React.useEffect(() => {
    if (!enabled) return;
    setValue(0);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, durationMs]);
  return value;
}

function AiScreen({ reduced }: { reduced: boolean }) {
  const [typing, setTyping] = React.useState(!reduced);
  React.useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => setTyping(false), 650);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  const revenue = useCountUp(DEMO_REVENUE, !reduced);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">AI trợ lý & Báo cáo</CardTitle>
              <CardDescription className="text-xs">Phân tích bằng tiếng Việt</CardDescription>
            </div>
          </div>
          <Badge variant="info">Live</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          <motion.div variants={listVariants} initial="hidden" animate="show" className="flex flex-col gap-2">
            <motion.div
              variants={itemVariants}
              className="max-w-[85%] self-end rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground"
            >
              {DEMO_AI_QUESTION}
            </motion.div>
            {typing ? (
              <motion.div
                variants={itemVariants}
                className="flex items-center gap-1 self-start rounded-md border bg-muted/30 px-3 py-2"
              >
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:240ms]" />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="max-w-[85%] self-start rounded-md bg-primary/10 px-3 py-2 text-xs"
              >
                {DEMO_AI_ANSWER}
              </motion.div>
            )}
          </motion.div>
          <motion.div variants={listVariants} initial="hidden" animate="show" className="flex flex-col gap-2">
            <motion.div variants={itemVariants} className="rounded-md border bg-muted/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">Doanh thu hôm nay</p>
              <p className="mt-0.5 text-base font-semibold">{formatVND(revenue)}</p>
            </motion.div>
            {DEMO_DASHBOARD.map((stat) => (
              <motion.div
                key={stat.label}
                variants={itemVariants}
                className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2"
              >
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <span className="text-sm font-semibold">{stat.value}</span>
              </motion.div>
            ))}
            <motion.div variants={itemVariants} className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Món bán chạy hôm nay</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                  <motion.div
                    className="h-full origin-left rounded-full bg-primary"
                    style={{ width: "72%" }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
                  />
                </div>
                <span className="text-sm font-medium">{DEMO_BEST_SELLER}</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </CardContent>
    </Card>
  );
}

const SCREENS: React.ComponentType<{ reduced: boolean }>[] = [
  OrderScreen,
  KitchenScreen,
  TablesScreen,
  MenuScreen,
  InventoryScreen,
  AiScreen,
];

export function FeatureDemoPanel() {
  const { activeIndex, isPaused, reducedMotion, jumpTo, replay, setPaused } = useFeatureDemo();
  const Screen = SCREENS[activeIndex];

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          {isPaused ? "Demo sản phẩm · tạm dừng" : "Demo sản phẩm"}
        </p>
        <Button variant="ghost" size="icon" onClick={replay} aria-label="Phát lại" title="Phát lại">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
      <div className="relative min-h-[320px]">
        {reducedMotion ? (
          <Screen reduced />
        ) : (
          <AnimatePresence mode="wait" initial>
            <motion.div
              key={FEATURES[activeIndex].id}
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Screen reduced={false} />
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        {FEATURES.map((feature, index) => (
          <button
            key={feature.id}
            type="button"
            onClick={() => jumpTo(index)}
            title={feature.demoLabel}
            aria-label={`Xem demo: ${feature.demoLabel}`}
            aria-current={index === activeIndex ? "step" : undefined}
            className={cn(
              "h-2.5 rounded-full transition-colors",
              index === activeIndex
                ? "w-6 bg-primary"
                : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
            )}
          />
        ))}
      </div>
    </div>
  );
}
