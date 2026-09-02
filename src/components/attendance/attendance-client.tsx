"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { MonitorSmartphone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AttendanceLogsTab } from "./attendance-logs-tab";
import { AttendanceSettingsTab } from "./attendance-settings-tab";
import { getAttendanceLogs } from "@/server/actions/attendance";
import type { AttendanceSettings, AttendanceLogWithDetails } from "@/server/actions/attendance";

interface Props {
  organizationId: string;
  branchId: string;
  initialSettings: AttendanceSettings;
  initialLogs: AttendanceLogWithDetails[];
  initialDate: string;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function AttendanceClient({
  organizationId,
  branchId,
  initialSettings,
  initialLogs,
  initialDate,
}: Props) {
  const [settings, setSettings] = useState<AttendanceSettings>(initialSettings);
  const [logs, setLogs] = useState<AttendanceLogWithDetails[]>(initialLogs);
  const [date, setDate] = useState(initialDate);
  const [navigating, startTransition] = useTransition();

  const fetchLogs = useCallback(
    async (d: string) => {
      const result = await getAttendanceLogs(organizationId, branchId, d);
      if (result.ok) setLogs(result.data);
    },
    [organizationId, branchId]
  );

  function navigateDay(direction: -1 | 1) {
    const newDate = addDays(date, direction);
    setDate(newDate);
    startTransition(async () => {
      await fetchLogs(newDate);
    });
  }

  function goToToday() {
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
    startTransition(async () => {
      await fetchLogs(today);
    });
  }

  return (
    <Tabs defaultValue="logs">
      <div className="flex items-center justify-between gap-4">
        <TabsList>
          <TabsTrigger value="logs">Nhật ký chấm công</TabsTrigger>
          <TabsTrigger value="settings">Cài đặt quy tắc</TabsTrigger>
        </TabsList>
        <Button variant="outline" size="sm" asChild>
          <Link href="/attendance/kiosk">
            <MonitorSmartphone className="mr-1.5 h-4 w-4" />
            Mở máy chấm công (Kiosk)
          </Link>
        </Button>
      </div>

      <TabsContent value="logs" className="mt-4">
        <AttendanceLogsTab
          logs={logs}
          date={date}
          navigating={navigating}
          onNavigate={navigateDay}
          onToday={goToToday}
        />
      </TabsContent>

      <TabsContent value="settings" className="mt-4">
        <AttendanceSettingsTab
          settings={settings}
          organizationId={organizationId}
          branchId={branchId}
          onSaved={setSettings}
        />
      </TabsContent>
    </Tabs>
  );
}
