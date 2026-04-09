import {
  CoreAdminContext,
  Form,
  ResourceContextProvider,
  ResourceDefinitionContextProvider,
  localStorageStore,
} from "ra-core";
import fakeDataProvider from "ra-data-fakerest";
import { useFormContext } from "react-hook-form";
import { MemoryRouter } from "react-router";
import { render } from "vitest-browser-react";

import { ContactInputs } from "./ContactInputs";
import { getSuggestedNameFromEmail } from "./contactName";
import { CONFIGURATION_STORE_KEY } from "../root/ConfigurationContext";
import { defaultConfiguration } from "../root/defaultConfiguration";

const mockIsMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: mockIsMobile,
}));

const resourceDefinitions = {
  companies: {
    hasList: true,
    name: "companies",
    recordRepresentation: (record: { name?: string }) => record?.name ?? "",
  },
  contacts: {
    hasList: true,
    name: "contacts",
  },
  sales: {
    hasList: true,
    name: "sales",
    recordRepresentation: (record: {
      first_name?: string;
      last_name?: string;
    }) => [record?.first_name, record?.last_name].filter(Boolean).join(" "),
  },
};

const i18nProvider = {
  translate: (key: string) => key,
  changeLocale: () => Promise.resolve(),
  getLocale: () => "en",
};

const baseCompany = {
  address: "",
  city: "",
  country: "",
  created_at: "2025-01-01T09:00:00.000Z",
  description: "",
  email: "",
  id: 1,
  linkedin_url: "",
  logo: {},
  name: "Acme AB",
  phone_number: "",
  revenue: "",
  sector: "",
  size: 10,
  state_abbr: "",
  tax_identifier: "",
  website: "",
  zipcode: "",
};

const Wrapper = ({
  children,
  companies = [],
}: {
  children: React.ReactNode;
  companies?: any[];
}) => {
  const store = localStorageStore(undefined, "CONTACT_INPUTS_TEST");
  store.setItem(CONFIGURATION_STORE_KEY, defaultConfiguration);

  return (
    <MemoryRouter>
      <CoreAdminContext
        dataProvider={fakeDataProvider({
          companies,
          contacts: [],
          sales: [
            {
              administrator: true,
              disabled: false,
              email: "user@example.com",
              first_name: "Test",
              id: 0,
              last_name: "User",
              user_id: "0",
            },
          ],
        })}
        i18nProvider={i18nProvider}
        store={store}
      >
        <ResourceDefinitionContextProvider definitions={resourceDefinitions}>
          <ResourceContextProvider value="contacts">
            {children}
          </ResourceContextProvider>
        </ResourceDefinitionContextProvider>
      </CoreAdminContext>
    </MemoryRouter>
  );
};

const FormValuesPreview = () => {
  const { watch } = useFormContext();

  return <pre data-testid="form-values">{JSON.stringify(watch())}</pre>;
};

const SetCompanyButton = ({ companyId }: { companyId: number }) => {
  const { setValue } = useFormContext();

  return (
    <button
      type="button"
      onClick={() => setValue("company_id", companyId, { shouldDirty: true })}
    >
      Select company
    </button>
  );
};

const readFormValues = (container: HTMLElement) =>
  JSON.parse(
    container.querySelector('[data-testid="form-values"]')?.textContent ?? "{}",
  );

describe("ContactInputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile.mockReturnValue(false);
  });

  it("allows submitting a contact without a last name", async () => {
    const handleSubmit = vi.fn();

    const screen = await render(
      <Wrapper>
        <Form
          defaultValues={{
            email_jsonb: [],
            first_name: "Cher",
            phone_jsonb: [],
            sales_id: 0,
          }}
          onSubmit={handleSubmit}
        >
          <ContactInputs />
          <button type="submit">Submit</button>
        </Form>
      </Wrapper>,
    );

    await screen.getByRole("button", { name: "Submit" }).click();

    await expect.poll(() => handleSubmit.mock.calls.length).toBe(1);
    expect(handleSubmit.mock.calls[0][0]).toMatchObject({
      first_name: "Cher",
      sales_id: 0,
    });
    expect(handleSubmit.mock.calls[0][0].last_name ?? "").toBe("");
  });

  it("derives the first name from email and leaves the last name blank when missing", () => {
    expect(getSuggestedNameFromEmail("madonna@example.com")).toEqual({
      first_name: "Madonna",
      last_name: "",
    });
  });

  it("adds work email and phone suggestions from the selected company when those fields are empty", async () => {
    const screen = await render(
      <Wrapper
        companies={[
          {
            ...baseCompany,
            email: "hello@acme.se",
            id: 1,
            phone_number: "08-123 45 67",
          },
        ]}
      >
        <Form
          defaultValues={{
            email_jsonb: [],
            first_name: "Ada",
            phone_jsonb: [],
            sales_id: 0,
          }}
        >
          <ContactInputs />
          <SetCompanyButton companyId={1} />
          <FormValuesPreview />
        </Form>
      </Wrapper>,
    );

    await screen.getByRole("button", { name: "Select company" }).click();

    await expect
      .poll(() => readFormValues(screen.container).email_jsonb?.[0])
      .toEqual({ email: "hello@acme.se", type: "Work" });
    await expect
      .poll(() => readFormValues(screen.container).phone_jsonb?.[0])
      .toEqual({ number: "08-123 45 67", type: "Work" });
  });

  it("keeps existing work email and phone values when selecting a company", async () => {
    const screen = await render(
      <Wrapper
        companies={[
          {
            ...baseCompany,
            email: "hello@acme.se",
            id: 1,
            phone_number: "08-123 45 67",
          },
        ]}
      >
        <Form
          defaultValues={{
            email_jsonb: [{ email: "founder@example.com", type: "Work" }],
            first_name: "Ada",
            phone_jsonb: [{ number: "070-555 55 55", type: "Work" }],
            sales_id: 0,
          }}
        >
          <ContactInputs />
          <SetCompanyButton companyId={1} />
          <FormValuesPreview />
        </Form>
      </Wrapper>,
    );

    await screen.getByRole("button", { name: "Select company" }).click();

    await expect
      .poll(() => readFormValues(screen.container).email_jsonb?.[0])
      .toEqual({ email: "founder@example.com", type: "Work" });
    await expect
      .poll(() => readFormValues(screen.container).phone_jsonb?.[0])
      .toEqual({ number: "070-555 55 55", type: "Work" });
  });
});
