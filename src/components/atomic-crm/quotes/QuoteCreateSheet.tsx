import { useGetIdentity, useTranslate } from "ra-core";
import { CreateSheet } from "../misc/CreateSheet";
import { QuoteInputs } from "./QuoteInputs";

export interface QuoteCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const QuoteCreateSheet = ({
  open,
  onOpenChange,
}: QuoteCreateSheetProps) => {
  const { identity } = useGetIdentity();
  const translate = useTranslate();

  const defaultValidUntil = new Date();
  defaultValidUntil.setDate(defaultValidUntil.getDate() + 30);

  return (
    <CreateSheet
      resource="quotes"
      title={translate("resources.quotes.action.new", { _: "New Quote" })}
      defaultValues={{
        sales_id: identity?.id,
        status: "draft",
        currency: "SEK",
        valid_until: defaultValidUntil.toISOString().split("T")[0],
        line_items: [],
      }}
      open={open}
      onOpenChange={onOpenChange}
    >
      <QuoteInputs />
    </CreateSheet>
  );
};
