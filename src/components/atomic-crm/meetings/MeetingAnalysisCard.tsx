import {
  CheckCircle,
  AlertTriangle,
  ListChecks,
  TrendingUp,
  MessageSquare,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AnalysisResult {
  summary: string;
  customer_needs: string[];
  objections: string[];
  action_items: Array<{
    text: string;
    assignee: string;
    due_days: number;
  }>;
  quote_context: {
    services_discussed: string[];
    budget_mentioned: string | null;
    timeline: string | null;
    decision_makers: string[];
    next_steps: string;
  };
  sentiment: "positive" | "neutral" | "negative";
  deal_probability: number;
}

const sentimentColors: Record<string, string> = {
  positive: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  neutral: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  negative: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const sentimentLabels: Record<string, string> = {
  positive: "Positivt",
  neutral: "Neutralt",
  negative: "Negativt",
};

export const MeetingAnalysisCard = ({
  analysis,
  tasksCreated,
}: {
  analysis: AnalysisResult;
  tasksCreated: number;
}) => {
  return (
    <div className="space-y-4">
      {/* Header: sentiment + probability */}
      <div className="flex items-center gap-2">
        <Badge className={sentimentColors[analysis.sentiment] || ""}>
          {sentimentLabels[analysis.sentiment] || analysis.sentiment}
        </Badge>
        <Badge variant="outline">
          <TrendingUp className="w-3.5 h-3.5 mr-1" />
          {analysis.deal_probability}% sannolikhet
        </Badge>
        {tasksCreated > 0 && (
          <Badge variant="secondary">
            <CheckCircle className="w-3.5 h-3.5 mr-1" />
            {tasksCreated} uppgifter skapade
          </Badge>
        )}
      </div>

      {/* Summary */}
      <div>
        <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
          <MessageSquare className="w-4 h-4" />
          Sammanfattning
        </div>
        <p className="text-sm text-muted-foreground">{analysis.summary}</p>
      </div>

      {/* Customer needs */}
      {analysis.customer_needs?.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            Kundens behov
          </div>
          <ul className="text-sm text-muted-foreground space-y-0.5">
            {analysis.customer_needs.map((need, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-green-500 mt-1">+</span>
                {need}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Objections */}
      {analysis.objections?.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Invändningar
          </div>
          <ul className="text-sm text-muted-foreground space-y-0.5">
            {analysis.objections.map((obj, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-amber-500 mt-1">!</span>
                {obj}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action items */}
      {analysis.action_items?.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
            <ListChecks className="w-4 h-4 text-blue-600" />
            Åtgärder
          </div>
          <ul className="text-sm text-muted-foreground space-y-0.5">
            {analysis.action_items.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-blue-500 mt-1">-</span>
                <span>
                  {item.text}
                  <span className="text-xs ml-1 opacity-70">
                    ({item.assignee}, {item.due_days}d)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quote context */}
      {analysis.quote_context?.services_discussed?.length > 0 && (
        <div className="border-t pt-3">
          <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
            <FileText className="w-4 h-4 text-purple-600" />
            Offertkontext
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>
              <span className="font-medium">Tjänster:</span>{" "}
              {analysis.quote_context.services_discussed.join(", ")}
            </div>
            {analysis.quote_context.budget_mentioned && (
              <div>
                <span className="font-medium">Budget:</span>{" "}
                {analysis.quote_context.budget_mentioned}
              </div>
            )}
            {analysis.quote_context.timeline && (
              <div>
                <span className="font-medium">Tidsram:</span>{" "}
                {analysis.quote_context.timeline}
              </div>
            )}
            {analysis.quote_context.next_steps && (
              <div>
                <span className="font-medium">Nästa steg:</span>{" "}
                {analysis.quote_context.next_steps}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
