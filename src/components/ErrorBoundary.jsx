import React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }
  static getDerivedStateFromError(error) {
    let message = error.message || "An unexpected error occurred.";
    try {
      const parsed = JSON.parse(message);
      if (parsed?.error) {
        message = `Permission or database error (${parsed.operationType || "operation"}): ${parsed.error}`;
      }
    } catch {
    }
    return { hasError: true, errorMessage: message };
  }
  componentDidCatch(error) {
    console.error("Uncaught application error:", error);
  }
  render() {
    if (this.state.hasError) {
      return <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E2DFD5] rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 text-[#B91C1C] mb-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="text-base font-semibold text-[#1C2420]">
                Operation Could Not Complete
              </h2>
            </div>
            <p className="text-sm text-[#6E6C63] leading-relaxed mb-5 break-words">
              {this.state.errorMessage}
            </p>
            <button
        type="button"
        onClick={() => {
          this.setState({ hasError: false, errorMessage: "" });
          window.location.reload();
        }}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors"
      >
              <RotateCw className="w-4 h-4" />
              Reload Portal
            </button>
          </div>
        </div>;
    }
    return this.props.children;
  }
}
export {
  ErrorBoundary
};
