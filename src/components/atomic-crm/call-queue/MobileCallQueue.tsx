import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { CallQueueContent } from "./CallQueue";

export const MobileCallQueue = () => {
  return (
    <div>
      <MobileHeader>
        <h1 className="text-xl font-semibold">Ringlista</h1>
      </MobileHeader>
      <MobileContent>
        <CallQueueContent />
      </MobileContent>
    </div>
  );
};
