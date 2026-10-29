import { CircleCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <Badge>Fundament aplikacji</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Jobs CRM</h1>
        </CardHeader>
        <CardContent>
          <p className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
            <CircleCheck
              aria-hidden="true"
              data-testid="foundation-icon"
              size={20}
              strokeWidth={2}
              className="mt-0.5 shrink-0"
            />
            Aplikacja została uruchomiona. To techniczna strona do weryfikacji
            fundamentu Jobs CRM.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
