import {
  CoreAdminContext,
  Form,
  ResourceContextProvider,
  ResourceDefinitionContextProvider,
  localStorageStore,
} from "ra-core";
import fakeDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { render } from "vitest-browser-react";

import { CompanyInputs } from "./CompanyInputs";
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
};

const i18nProvider = {
  translate: (key: string) => key,
  changeLocale: () => Promise.resolve(),
  getLocale: () => "en",
};

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const store = localStorageStore(undefined, "COMPANY_INPUTS_TEST");
  store.setItem(CONFIGURATION_STORE_KEY, defaultConfiguration);

  return (
    <MemoryRouter>
      <CoreAdminContext
        dataProvider={fakeDataProvider({
          companies: [],
          sales: [],
        })}
        i18nProvider={i18nProvider}
        store={store}
      >
        <ResourceDefinitionContextProvider definitions={resourceDefinitions}>
          <ResourceContextProvider value="companies">
            {children}
          </ResourceContextProvider>
        </ResourceDefinitionContextProvider>
      </CoreAdminContext>
    </MemoryRouter>
  );
};

describe("CompanyInputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile.mockReturnValue(false);
  });

  it("submits the company email and phone fields as part of the form values", async () => {
    const handleSubmit = vi.fn();

    const screen = await render(
      <Wrapper>
        <Form
          defaultValues={{
            email: "kontakt@acme.se",
            name: "Acme AB",
            phone_number: "08-123 45 67",
          }}
          onSubmit={handleSubmit}
        >
          <CompanyInputs />
          <button type="submit">Submit</button>
        </Form>
      </Wrapper>,
    );

    const emailInput = screen.container.querySelector(
      'input[name="email"]',
    ) as HTMLInputElement | null;
    const phoneInput = screen.container.querySelector(
      'input[name="phone_number"]',
    ) as HTMLInputElement | null;

    expect(emailInput?.value).toBe("kontakt@acme.se");
    expect(phoneInput?.value).toBe("08-123 45 67");

    await screen.getByRole("button", { name: "Submit" }).click();

    await expect.poll(() => handleSubmit.mock.calls.length).toBe(1);
    expect(handleSubmit.mock.calls[0][0]).toMatchObject({
      email: "kontakt@acme.se",
      name: "Acme AB",
      phone_number: "08-123 45 67",
    });
  });
});
