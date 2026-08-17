import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import type { FeedbackCategory } from "../types";
import { FEEDBACK_CATEGORIES } from "./feedbackCategories";

/**
 * Kategoriväljaren. Delas av input-baren och redigeringsformuläret så att
 * "Funkar bra / Funkar inte / Förslag" ser och beter sig identiskt i båda.
 */
export const FeedbackCategoryToggle = ({
  value,
  onChange,
  className,
}: {
  value: FeedbackCategory;
  onChange: (value: FeedbackCategory) => void;
  className?: string;
}) => (
  <ToggleGroup
    type="single"
    value={value}
    onValueChange={(next) => next && onChange(next as FeedbackCategory)}
    variant="outline"
    // @container: etiketterna ska styras av den här radens bredd, inte
    // viewportens — panelen är alltid 24rem (eller mindre) även på en stor
    // skärm, så en sm:-breakpoint säger inget om utrymmet här.
    // w-full behövs: container-type gör att innehållet inte får bestämma bredden.
    className={cn("@container w-full", className)}
  >
    {FEEDBACK_CATEGORIES.map((option) => (
      <ToggleGroupItem
        key={option.value}
        value={option.value}
        // flex-auto ger innehållsbaserad basbredd (i stället för flex-1:s 0) och
        // rensar basvariantens shrink-0 via tailwind-merge, så knapparna krymper
        // i stället för att spränga panelen. Knapparna fyller raden ändå, så den
        // låga px-1 påverkar bara var etiketterna får plats — inte hur det ser ut.
        className="h-8 flex-auto gap-1 px-1 text-[11px]"
        aria-label={option.label}
        title={option.label}
      >
        <span aria-hidden="true">{option.emoji}</span>
        {/* De tre etiketterna kräver ~326px tillsammans — visa dem bara när
            raden faktiskt är bred nog (24rem-panelen ger 358px), annars talar
            emoji + aria-label/title om vad knappen gör. truncate är sista
            skyddsnätet om ett emoji-typsnitt är bredare än väntat. */}
        <span className="hidden min-w-0 truncate @min-[22rem]:inline">
          {option.label}
        </span>
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);
