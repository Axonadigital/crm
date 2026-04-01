import { Form, useGetIdentity, useRedirect } from "ra-core";
import { Create } from "@/components/admin/create";
import { SaveButton } from "@/components/admin/form";
import { FormToolbar } from "@/components/admin/simple-form";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import { QuoteInputs } from "./QuoteInputs";

export const QuoteCreate = ({ open }: { open: boolean }) => {
  const redirect = useRedirect();
  const { identity } = useGetIdentity();

  const handleClose = () => {
    redirect("/quotes");
  };

  const defaultValidUntil = new Date();
  defaultValidUntil.setDate(defaultValidUntil.getDate() + 30);

  return (
    <Dialog open={open} onOpenChange={() => handleClose()}>
      <DialogContent className="lg:max-w-4xl overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        <Create
          resource="quotes"
          redirect="list"
          mutationOptions={{
            onSuccess: () => {
              redirect("/quotes");
            },
          }}
        >
          <Form
            defaultValues={{
              sales_id: identity?.id,
              status: "draft",
              currency: "SEK",
              valid_until: defaultValidUntil.toISOString().split("T")[0],
              line_items: [],
            }}
          >
            <QuoteInputs />
            <FormToolbar>
              <SaveButton />
            </FormToolbar>
          </Form>
        </Create>
      </DialogContent>
    </Dialog>
  );
};
