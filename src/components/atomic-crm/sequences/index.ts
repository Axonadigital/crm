import { SequenceCreate } from "./SequenceCreate";
import { SequenceEdit } from "./SequenceEdit";
import { SequenceList } from "./SequenceList";

export default {
  list: SequenceList,
  create: SequenceCreate,
  edit: SequenceEdit,
  recordRepresentation: (record: { name: string }) => record.name,
};
