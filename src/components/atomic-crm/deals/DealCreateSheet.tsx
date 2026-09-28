import { useGetIdentity, useTranslate } from "ra-core";
import { CreateSheet } from "../misc/CreateSheet";
import { DealInputs } from "./DealInputs";

export interface DealCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DealCreateSheet = ({
  open,
  onOpenChange,
}: DealCreateSheetProps) => {
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  return (
    <CreateSheet
      resource="deals"
      title={translate("resources.deals.action.new", { _: "New Deal" })}
      defaultValues={{
        sales_id: identity?.id,
        contact_ids: [],
        index: 0,
      }}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DealInputs />
    </CreateSheet>
  );
};
