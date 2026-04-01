import { Check } from "lucide-react";

export default function PetitionStepIndicator({ steps, currentStep }) {
  return (
    <div className="flex items-center justify-between">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center flex-1">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                i < currentStep
                  ? "bg-green-600 text-white"
                  : i === currentStep
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < currentStep ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-sm hidden md:block ${i === currentStep ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-px mx-4 ${i < currentStep ? "bg-green-600" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}