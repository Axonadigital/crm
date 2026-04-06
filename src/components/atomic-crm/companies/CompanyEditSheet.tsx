import type { Identifier } from "ra-core";
import { EditSheet } from "../misc/EditSheet";
import { CompanyInputs } from "./CompanyInputs";

export interface CompanyEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: Identifier;
}

export const CompanyEditSheet = ({
  open,
  onOpenChange,
  companyId,
}: CompanyEditSheetProps) => {
  return (
    <EditSheet
      resource="companies"
      id={companyId}
      open={open}
      onOpenChange={onOpenChange}
      redirect="show"
      mutationMode="pessimistic"
    >
      <CompanyInputs />
    </EditSheet>
  );
};
