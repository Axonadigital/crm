import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";

interface ScrapeRequest {
  query: string; // Sökfråga, t.ex. "restauranger i Stockholm"
  limit?: number; // Max antal resultat (standard 20)
}

interface GoogleMapsPlace {
  place_id: string;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviews_count?: number;
  category?: string;
  latitude?: number;
  longitude?: number;
}

// Mockad testdata för demonstration
function generateMockData(query: string, limit: number): GoogleMapsPlace[] {
  const categories = ["restaurant", "cafe", "hotel", "shop", "office"];
  const cities = ["Stockholm", "Göteborg", "Malmö", "Uppsala", "Västerås"];
  const streets = [
    "Drottninggatan",
    "Storgatan",
    "Kungsgatan",
    "Sveavägen",
    "Hamngatan",
  ];

  const mockPlaces: GoogleMapsPlace[] = [];

  for (let i = 0; i < Math.min(limit, 20); i++) {
    const city = cities[Math.floor(Math.random() * cities.length)];
    const street = streets[Math.floor(Math.random() * streets.length)];
    const streetNumber = Math.floor(Math.random() * 100) + 1;
    const zipCode = `${100 + Math.floor(Math.random() * 900)}${10 + Math.floor(Math.random() * 90)}`;

    mockPlaces.push({
      name: `${query.split(" ")[0]} ${i + 1}`,
      address: `${street} ${streetNumber}, ${zipCode} ${city}, Sverige`,
      phone: `08-${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 90) + 10} ${Math.floor(Math.random() * 90) + 10}`,
      website: `https://exempel-${i + 1}.se`,
      rating: 3.5 + Math.random() * 1.5,
      reviews_count: Math.floor(Math.random() * 500) + 10,
      category: categories[Math.floor(Math.random() * categories.length)],
      latitude: 59.3293 + (Math.random() - 0.5) * 0.1,
      longitude: 18.0686 + (Math.random() - 0.5) * 0.1,
    });
  }

  return mockPlaces;
}

async function scrapeGoogleMaps(
  query: string,
  limit: number = 20,
): Promise<GoogleMapsPlace[]> {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

  if (!apiKey) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY saknas i miljövariabler. Lägg till nyckeln i supabase/functions/.env",
    );
  }

  console.log("Använder Google Maps API för sökning:", query);

  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
  const searchResponse = await fetch(searchUrl);
  const searchData = await searchResponse.json();

  console.log("Google Maps API status:", searchData.status);

  if (searchData.status === "REQUEST_DENIED") {
    throw new Error(
      `Google Maps API nekade förfrågan: ${searchData.error_message || "Kontrollera att Places API är aktiverat i Google Cloud Console"}`,
    );
  }

  if (searchData.status === "OVER_QUERY_LIMIT") {
    throw new Error(
      "Google Maps API quota överskriden. Kontrollera din fakturering och kvot i Google Cloud Console.",
    );
  }

  if (searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
    throw new Error(
      `Google Maps API fel: ${searchData.status} - ${searchData.error_message || "Okänt fel"}`,
    );
  }

  if (!searchData.results || searchData.results.length === 0) {
    return [];
  }

  const results = searchData.results.slice(0, limit);
  const places: GoogleMapsPlace[] = [];

  for (const result of results) {
    try {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${result.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types,geometry&key=${apiKey}`;
      const detailsResponse = await fetch(detailsUrl);
      const detailsData = await detailsResponse.json();

      if (detailsData.status === "OK" && detailsData.result) {
        const place = detailsData.result;
        places.push({
          place_id: result.place_id,
          name: place.name || "",
          address: place.formatted_address || "",
          phone: place.formatted_phone_number || "",
          website: place.website || "",
          rating: place.rating || 0,
          reviews_count: place.user_ratings_total || 0,
          category: place.types?.[0] || "",
          latitude: place.geometry?.location?.lat,
          longitude: place.geometry?.location?.lng,
        });
      }
    } catch (error) {
      console.error(`Fel vid hämtning av detaljer för plats: ${error}`);
    }
  }

  return places;
}

async function handleScrapeRequest(req: Request, currentUserSale: any) {
  const { query, limit = 20 }: ScrapeRequest = await req.json();

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return createErrorResponse(400, "Sökfråga krävs");
  }

  if (limit < 1 || limit > 50) {
    return createErrorResponse(400, "Limit måste vara mellan 1 och 50");
  }

  try {
    const places = await scrapeGoogleMaps(query, limit);

    return new Response(
      JSON.stringify({
        success: true,
        query,
        count: places.length,
        data: places,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Fel vid scraping:", error);
    return createErrorResponse(
      500,
      `Scraping misslyckades: ${(error as Error).message}`,
    );
  }
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Metod ej tillåten");
        }

        return handleScrapeRequest(req, user);
      }),
    ),
  ),
);
