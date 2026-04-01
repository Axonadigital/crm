import { useTranslate } from "ra-core";
import { matchPath, useLocation } from "react-router";
import { CreateButton } from "@/components/admin/create-button";

import useAppBarHeight from "../misc/useAppBarHeight";
import { QuoteCreate } from "./QuoteCreate";

export const QuoteEmpty = () => {
  const translate = useTranslate();
  const location = useLocation();
  const matchCreate = matchPath("/quotes/create", location.pathname);
  const appbarHeight = useAppBarHeight();

  return (
    <div
      className="flex flex-col justify-center items-center gap-12"
      style={{
        height: `calc(100dvh - ${appbarHeight}px)`,
      }}
    >
      <img
        src="./img/empty.svg"
        alt={translate("resources.quotes.empty.title")}
      />
      <div className="flex flex-col items-center gap-0">
        <h3 className="text-lg font-bold">
          {translate("resources.quotes.empty.title")}
        </h3>
        <p className="text-sm text-center text-muted-foreground mb-4">
          {translate("resources.quotes.empty.description")}
        </p>
      </div>
      <div className="flex space-x-8">
        <CreateButton label="resources.quotes.action.create" />
      </div>
      <QuoteCreate open={!!matchCreate} />
    </div>
  );
};
