// Importerar de rena reglerna direkt, inte feedbackImages.ts: den senare drar in
// supabase-klienten, som kastar "supabaseUrl is required" i vitests browser-mode
// (mode "test" laddar ingen .env, och vi.mock hinner inte före modulgrafen där).
import {
  MAX_FEEDBACK_IMAGES,
  feedbackImagePath,
  imagesFromClipboard,
  pickFeedbackImages,
} from "./feedbackImageRules";

const makeFile = (name: string, type: string, size = 1024) => {
  const file = new File(["x"], name, { type });
  // File-storleken går inte att sätta via konstruktorn utan att allokera bytes.
  Object.defineProperty(file, "size", { value: size });
  return file;
};

describe("pickFeedbackImages", () => {
  it("släpper igenom bilder inom gränserna", () => {
    const files = [makeFile("a.png", "image/png")];
    const { accepted, errors } = pickFeedbackImages(files, 3);
    expect(accepted).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("avvisar filer som inte är bilder", () => {
    const { accepted, errors } = pickFeedbackImages(
      [makeFile("rapport.pdf", "application/pdf")],
      3,
    );
    expect(accepted).toEqual([]);
    expect(errors).toEqual(["rapport.pdf är inte en bild."]);
  });

  it("avvisar bildformat som bucketen inte tillåter", () => {
    // SVG passerar "image/*" men finns inte i bucketens allowed_mime_types —
    // hade den släppts igenom skulle uppladdningen faila mitt i batchen.
    const { accepted, errors } = pickFeedbackImages(
      [makeFile("ikon.svg", "image/svg+xml")],
      3,
    );
    expect(accepted).toEqual([]);
    expect(errors).toEqual([
      "ikon.svg har ett bildformat som inte stöds (använd PNG, JPG, WEBP eller GIF).",
    ]);
  });

  it("hoppar över filer större än 5 MB och namnger dem", () => {
    const files = [
      makeFile("liten.png", "image/png", 1024),
      makeFile("stor.png", "image/png", 6 * 1024 * 1024),
    ];
    const { accepted, errors } = pickFeedbackImages(files, 3);
    expect(accepted.map((f) => f.name)).toEqual(["liten.png"]);
    expect(errors).toEqual(["stor.png är större än 5 MB och hoppades över."]);
  });

  it("trunkerar till kvarvarande plats och varnar om maxantalet", () => {
    const files = [
      makeFile("1.png", "image/png"),
      makeFile("2.png", "image/png"),
      makeFile("3.png", "image/png"),
    ];
    const { accepted, errors } = pickFeedbackImages(files, 2);
    expect(accepted.map((f) => f.name)).toEqual(["1.png", "2.png"]);
    expect(errors).toContain(
      `Max ${MAX_FEEDBACK_IMAGES} bilder per meddelande.`,
    );
  });

  it("accepterar ingenting när det inte finns plats kvar", () => {
    const { accepted, errors } = pickFeedbackImages(
      [makeFile("1.png", "image/png")],
      0,
    );
    expect(accepted).toEqual([]);
    expect(errors).toContain(
      `Max ${MAX_FEEDBACK_IMAGES} bilder per meddelande.`,
    );
  });
});

describe("imagesFromClipboard", () => {
  const clipboard = (
    items: { kind: string; type: string; file: File | null }[],
  ) =>
    ({
      items: items.map((item) => ({
        kind: item.kind,
        type: item.type,
        getAsFile: () => item.file,
      })),
    }) as unknown as DataTransfer;

  it("plockar ut inklistrade bilder", () => {
    const file = makeFile("image.png", "image/png");
    const files = imagesFromClipboard(
      clipboard([{ kind: "file", type: "image/png", file }]),
    );
    expect(files).toEqual([file]);
  });

  it("ignorerar inklistrad text", () => {
    expect(
      imagesFromClipboard(
        clipboard([{ kind: "string", type: "text/plain", file: null }]),
      ),
    ).toEqual([]);
  });

  it("klarar ett event utan clipboardData", () => {
    expect(imagesFromClipboard(null)).toEqual([]);
  });
});

describe("feedbackImagePath", () => {
  it("plockar ut storage-pathen ur en publik URL", () => {
    const url =
      "https://x.supabase.co/storage/v1/object/public/feedback-images/abc-123/def-456.png";
    expect(feedbackImagePath(url)).toBe("abc-123/def-456.png");
  });

  it("använder sista förekomsten av bucketnamnet", () => {
    const url =
      "https://x.supabase.co/storage/v1/object/public/feedback-images/uid/feedback-images/bild.png";
    expect(feedbackImagePath(url)).toBe("bild.png");
  });

  it("returnerar null för URL:er utanför bucketen", () => {
    expect(
      feedbackImagePath(
        "https://x.supabase.co/storage/v1/object/public/attachments/fil.png",
      ),
    ).toBeNull();
    expect(feedbackImagePath("inte-en-url")).toBeNull();
  });
});
