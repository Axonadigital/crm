import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import { TasksListContent } from "./TasksListContent";
import { useRefresh, useTranslate } from "ra-core";

export const MobileTasksList = () => {
  const translate = useTranslate();
  const refresh = useRefresh();
  return (
    <>
      <MobileHeader>
        <h1 className="text-xl font-semibold">
          {translate("resources.tasks.name", { smart_count: 2 })}
        </h1>
      </MobileHeader>
      <MobileContent onRefresh={refresh}>
        <TasksListContent />
      </MobileContent>
    </>
  );
};
