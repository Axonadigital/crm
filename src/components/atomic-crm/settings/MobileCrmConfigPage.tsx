import { ArrowLeft } from "lucide-react";
import { EditBase, Form, useNotify, useTranslate } from "ra-core";
import { useMemo } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import {
  useConfigurationContext,
  useConfigurationUpdater,
} from "../root/ConfigurationContext";
import {
  SettingsFormFields,
  transformSettingsFormValues,
} from "./SettingsFormFields";

/**
 * Mobile CRM configuration page.
 *
 * Uses the same shared `SettingsFormFields` component as the desktop
 * `SettingsPage`, but renders sections as an Accordion instead of a
 * multi-Card + left-nav layout. This keeps form logic in one place
 * and avoids drift between desktop and mobile.
 */
export const MobileCrmConfigPage = () => {
  const updateConfiguration = useConfigurationUpdater();
  const notify = useNotify();
  const translate = useTranslate();

  return (
    <>
      <MobileHeader>
        <div className="flex items-center gap-2 flex-1">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-9 -ml-2"
            aria-label={translate("ra.action.back", { _: "Tillbaka" })}
          >
            <Link to="/settings">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold truncate">
            {translate("crm.settings.title", { _: "Inställningar" })}
          </h1>
        </div>
      </MobileHeader>
      <MobileContent>
        <EditBase
          resource="configuration"
          id={1}
          mutationMode="pessimistic"
          redirect={false}
          transform={transformSettingsFormValues}
          mutationOptions={{
            onSuccess: (data: any) => {
              updateConfiguration(data.config);
              notify("crm.settings.saved");
            },
            onError: () => {
              notify("crm.settings.save_error", {
                type: "error",
              });
            },
          }}
        >
          <MobileCrmConfigForm />
        </EditBase>
      </MobileContent>
    </>
  );
};

MobileCrmConfigPage.path = "/crm-config";

const MobileCrmConfigForm = () => {
  const config = useConfigurationContext();

  const defaultValues = useMemo(
    () => ({
      title: config.title,
      lightModeLogo: { src: config.lightModeLogo },
      darkModeLogo: { src: config.darkModeLogo },
      currency: config.currency,
      companySectors: config.companySectors,
      dealCategories: config.dealCategories,
      taskTypes: config.taskTypes,
      dealStages: config.dealStages,
      dealPipelineStatuses: config.dealPipelineStatuses,
      noteStatuses: config.noteStatuses,
      sellerCompany: config.sellerCompany,
      proposalKbTemplate: config.proposalKbTemplate,
      revenueGoals: config.revenueGoals,
    }),
    [config],
  );

  return (
    <Form defaultValues={defaultValues}>
      <SettingsFormFields variant="mobile" />
    </Form>
  );
};
