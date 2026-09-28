import type { Identifier } from "ra-core";
import { EditSheet } from "../misc/EditSheet";
import { DealInputs } from "./DealInputs";

export interface DealEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: Identifier;
}

export const DealEditSheet = ({
  open,
  onOpenChange,
  dealId,
}: DealEditSheetProps) => {
  return (
    <EditSheet
      resource="deals"
      id={dealId}
      open={open}
      onOpenChange={onOpenChange}
      redirect="show"
      mutationMode="pessimistic"
    >
      <DealInputs />
    </EditSheet>
  );
};
