import { useMemo } from "react";
import { useStore } from "ra-core";

import type { DealStage, LabeledValue, NoteStatus } from "../types";
import { defaultConfiguration } from "./defaultConfiguration";

export const CONFIGURATION_STORE_KEY = "app.configuration";

export interface SellerCompanyInfo {
  companyName: string;
  orgNumber: string;
  vatNumber: string;
  fSkatt: boolean;
  address: string;
  zipcode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  bankgiro: string;
  plusgiro: string;
  iban: string;
  bic: string;
  defaultPaymentTerms: string;
  defaultDeliveryTerms: string;
  defaultTermsAndConditions: string;
  quoteLogo: string;
}

export interface RevenueGoal {
  label: string;
  amount: number;
  period: "weekly" | "monthly" | "quarterly" | "yearly";
}

export interface ConfigurationContextValue {
  companySectors: LabeledValue[];
  currency: string;
  dealCategories: LabeledValue[];
  dealPipelineStatuses: string[];
  dealStages: DealStage[];
  noteStatuses: NoteStatus[];
  taskTypes: LabeledValue[];
  title: string;
  darkModeLogo: string;
  lightModeLogo: string;
  googleWorkplaceDomain?: string;
  disableEmailPasswordAuthentication?: boolean;
  sellerCompany: SellerCompanyInfo;
  proposalKbTemplate: string;
  revenueGoals: RevenueGoal[];
}

export const useConfigurationContext = () => {
  const [config] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
    defaultConfiguration,
  );
  // Merge with defaults so that missing fields in stored config
  // fall back to default values (e.g. when new settings are added)
  return useMemo(() => ({ ...defaultConfiguration, ...config }), [config]);
};

export const useConfigurationUpdater = () => {
  const [, setConfig] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
  );
  return setConfig;
};
