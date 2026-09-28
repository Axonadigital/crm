import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Welcome = () => (
  <Card>
    <CardHeader className="px-4">
      <CardTitle>Welcome to Axona Digital CRM</CardTitle>
    </CardHeader>
    <CardContent className="px-4">
      <p className="text-sm mb-4">
        This workspace is branded for Axona Digital and is ready for your sales
        pipeline, contact management, notes, and follow-up flows.
      </p>
      <p className="text-sm mb-4">
        This demo runs on a mock API, so you can explore and modify the data. It
        resets on reload. The full version uses Supabase for the backend.
      </p>
      <p className="text-sm">
        Use the onboarding actions below to add your first contact, log your
        first note, and start working in the live CRM.
      </p>
    </CardContent>
  </Card>
);
