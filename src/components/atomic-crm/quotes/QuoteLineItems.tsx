import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const QuoteLineItems = () => {
  const translate = useTranslate();
  const { control, register } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "line_items",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-medium">
          {translate("resources.quotes.line_items.title", {
            _: "Line items",
          })}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({
              description: "",
              quantity: 1,
              unit_price: 0,
            })
          }
        >
          <Plus className="w-4 h-4 mr-1" />
          {translate("resources.quotes.line_items.add", {
            _: "Add line item",
          })}
        </Button>
      </div>

      {fields.length > 0 && (
        <div className="border rounded-md">
          <div className="grid grid-cols-[1fr_100px_120px_120px_40px] gap-2 p-3 bg-muted/50 text-xs font-medium text-muted-foreground">
            <span>
              {translate("resources.quotes.line_items.description", {
                _: "Description",
              })}
            </span>
            <span>
              {translate("resources.quotes.line_items.quantity", {
                _: "Qty",
              })}
            </span>
            <span>
              {translate("resources.quotes.line_items.unit_price", {
                _: "Unit price",
              })}
            </span>
            <span>
              {translate("resources.quotes.line_items.total", {
                _: "Total",
              })}
            </span>
            <span />
          </div>

          {fields.map((field, index) => (
            <LineItemRow
              key={field.id}
              index={index}
              register={register}
              control={control}
              onRemove={() => remove(index)}
            />
          ))}

          <TotalRow control={control} />
        </div>
      )}
    </div>
  );
};

const LineItemRow = ({
  index,
  register,
  control,
  onRemove,
}: {
  index: number;
  register: ReturnType<typeof useFormContext>["register"];
  control: ReturnType<typeof useFormContext>["control"];
  onRemove: () => void;
}) => {
  const quantity = useWatch({ control, name: `line_items.${index}.quantity` });
  const unitPrice = useWatch({
    control,
    name: `line_items.${index}.unit_price`,
  });
  const lineTotal = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  return (
    <div className="grid grid-cols-[1fr_100px_120px_120px_40px] gap-2 p-3 border-t items-center">
      <Input
        {...register(`line_items.${index}.description`, { required: true })}
        placeholder="Service description"
        className="h-8"
      />
      <Input
        {...register(`line_items.${index}.quantity`, { valueAsNumber: true })}
        type="number"
        min={1}
        step={1}
        className="h-8"
      />
      <Input
        {...register(`line_items.${index}.unit_price`, { valueAsNumber: true })}
        type="number"
        min={0}
        step={100}
        className="h-8"
      />
      <span className="text-sm font-medium px-2">
        {lineTotal.toLocaleString("sv-SE")} kr
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onRemove}
      >
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
};

const TotalRow = ({
  control,
}: {
  control: ReturnType<typeof useFormContext>["control"];
}) => {
  const translate = useTranslate();
  const lineItems = useWatch({ control, name: "line_items" });
  const vatRate = Number(useWatch({ control, name: "vat_rate" })) || 25;
  const discountPct =
    Number(useWatch({ control, name: "discount_percent" })) || 0;
  const currency = useWatch({ control, name: "currency" }) || "SEK";

  const subtotal = (lineItems || []).reduce(
    (sum: number, item: { quantity?: number; unit_price?: number }) =>
      sum + (Number(item?.quantity) || 0) * (Number(item?.unit_price) || 0),
    0,
  );

  const discountAmount = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = afterDiscount * (vatRate / 100);
  const total = afterDiscount + vatAmount;

  const fmt = (n: number) =>
    n.toLocaleString("sv-SE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="border-t bg-muted/30 p-3 space-y-1">
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <span className="text-sm text-right">
          {translate("resources.quotes.fields.subtotal", { _: "Subtotal" })}:
        </span>
        <span className="text-sm font-medium px-2 text-right">
          {fmt(subtotal)} {currency}
        </span>
      </div>
      {discountPct > 0 && (
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <span className="text-sm text-right text-destructive">
            {translate("resources.quotes.fields.discount_percent", {
              _: "Discount",
            })}{" "}
            ({discountPct}%):
          </span>
          <span className="text-sm font-medium px-2 text-right text-destructive">
            -{fmt(discountAmount)} {currency}
          </span>
        </div>
      )}
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <span className="text-sm text-right">
          {translate("resources.quotes.fields.vat_rate", { _: "VAT" })} (
          {vatRate}%):
        </span>
        <span className="text-sm font-medium px-2 text-right">
          {fmt(vatAmount)} {currency}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_120px] gap-2 pt-1 border-t border-foreground/20">
        <span className="text-sm font-bold text-right">
          {translate("resources.quotes.fields.total_amount", {
            _: "Total incl. VAT",
          })}
          :
        </span>
        <span className="text-sm font-bold px-2 text-right">
          {fmt(total)} {currency}
        </span>
      </div>
    </div>
  );
};
