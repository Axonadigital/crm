import {
  EditBase,
  Form,
  useEditContext,
  useNotify,
  useRecordContext,
  useRedirect,
  useTranslate,
} from "ra-core";
import { Link } from "react-router";
import { DeleteWithConfirmButton } from "@/components/admin/delete-with-confirm-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { FormToolbar } from "../layout/FormToolbar";
import type { Quote } from "../types";
import { QuoteInputs } from "./QuoteInputs";

export const QuoteEdit = ({ open, id }: { open: boolean; id?: string }) => {
  const redirect = useRedirect();
  const notify = useNotify();

  const handleClose = () => {
    redirect("/quotes", undefined, undefined, undefined, {
      _scrollToTop: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={() => handleClose()}>
      <DialogContent className="lg:max-w-4xl p-4 overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        {id ? (
          <EditBase
            id={id}
            mutationMode="pessimistic"
            mutationOptions={{
              onSuccess: () => {
                notify("resources.quotes.notifications.updated", {
                  _: "Quote updated",
                });
                redirect(
                  `/quotes/${id}/show`,
                  undefined,
                  undefined,
                  undefined,
                  {
                    _scrollToTop: false,
                  },
                );
              },
            }}
          >
            <EditHeader />
            <Form>
              <QuoteInputs />
              <FormToolbar />
            </Form>
          </EditBase>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

function EditHeader() {
  const translate = useTranslate();
  const { defaultTitle } = useEditContext<Quote>();
  const quote = useRecordContext<Quote>();
  if (!quote) {
    return null;
  }

  return (
    <DialogTitle className="pb-0">
      <div className="flex justify-between items-start mb-8">
        <h2 className="text-2xl font-semibold">{defaultTitle}</h2>
        <div className="flex gap-2 pr-12">
          <DeleteWithConfirmButton />
          <Button asChild variant="outline" className="h-9">
            <Link to={`/quotes/${quote.id}/show`}>
              {translate("resources.quotes.action.back_to_quote", {
                _: "Back to quote",
              })}
            </Link>
          </Button>
        </div>
      </div>
    </DialogTitle>
  );
}
