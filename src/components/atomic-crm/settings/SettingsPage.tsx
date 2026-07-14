import { EditBase, Form, useNotify } from "ra-core";
import { useMemo } from "react";

import { FortnoxIntegrationCard } from "./FortnoxIntegrationCard";
import {
  SettingsFormFields,
  transformSettingsFormValues,
} from "./SettingsFormFields";
import {
  useConfigurationContext,
  useConfigurationUpdater,
} from "../root/ConfigurationContext";

export const SettingsPage = () => {
  const updateConfiguration = useConfigurationUpdater();
  const notify = useNotify();

  return (
    <div className="space-y-6">
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
        <SettingsForm />
      </EditBase>
      <FortnoxIntegrationCard />
    </div>
  );
};

SettingsPage.path = "/settings";

const SettingsForm = () => {
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
      <SettingsFormFields variant="desktop" />
    </Form>
  );
};
