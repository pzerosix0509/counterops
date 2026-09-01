"use client";
import { HelpCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTutorial } from "@/components/tutorial/tutorial-provider";

export function ReplayTutorialCard() {
  const { restart } = useTutorial();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          Hướng dẫn sử dụng
        </CardTitle>
        <CardDescription>Xem lại toàn bộ hướng dẫn các trang chính bất cứ lúc nào.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" size="sm" onClick={restart}>
          Xem lại hướng dẫn
        </Button>
      </CardContent>
    </Card>
  );
}
