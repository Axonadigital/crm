import { required } from "ra-core";
import { contactOptionText } from "../misc/ContactOption";
import { ReferenceInput } from "@/components/admin/reference-input";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { DateTimeInput } from "@/components/admin";

export const CalendarForm = () => {
  return (
    <div className="space-y-4">
      <TextInput
        source="title"
        label="resources.calendar_events.fields.title"
        required
        validate={required()}
      />
      <TextInput
        source="description"
        label="resources.calendar_events.fields.description"
        multiline
        fullWidth
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DateTimeInput
          source="starts_at"
          label="resources.calendar_events.fields.starts_at"
          validate={required()}
          helperText={false}
        />
        <DateTimeInput
          source="ends_at"
          label="resources.calendar_events.fields.ends_at"
          validate={required()}
          helperText={false}
        />
      </div>
      <ReferenceInput source="contact_id" reference="contacts_summary">
        <AutocompleteInput
          label="resources.calendar_events.fields.contact_id"
          optionText={contactOptionText}
          helperText={false}
          modal
          fullWidth
        />
      </ReferenceInput>
      <TextInput
        source="attendee_emails"
        label="resources.calendar_events.fields.attendee_emails"
        multiline
        helperText={false}
        placeholder="ada@example.com, bob@example.com"
      />
      <SelectInput
        source="meeting_provider"
        label="resources.calendar_events.fields.meeting_provider"
        choices={[
          { id: "google_meet", name: "Google Meet" },
        ]}
        helperText={false}
      />
      <SelectInput
        source="status"
        label="resources.calendar_events.fields.status"
        choices={[
          { id: "scheduled", name: "Scheduled" },
          { id: "completed", name: "Completed" },
          { id: "cancelled", name: "Cancelled" },
        ]}
        helperText={false}
      />
    </div>
  );
};
