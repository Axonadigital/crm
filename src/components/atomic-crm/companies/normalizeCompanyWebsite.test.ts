import { normalizeCompanyWebsite } from "./normalizeCompanyWebsite";

describe("normalizeCompanyWebsite", () => {
  it("adds https when the website has no protocol", () => {
    expect(
      normalizeCompanyWebsite({
        name: "Acme AB",
        website: "acme.se",
      }),
    ).toEqual({
      name: "Acme AB",
      website: "https://acme.se",
    });
  });

  it("leaves existing protocols unchanged", () => {
    expect(
      normalizeCompanyWebsite({
        name: "Acme AB",
        website: "https://acme.se",
      }),
    ).toEqual({
      name: "Acme AB",
      website: "https://acme.se",
    });
  });
});
