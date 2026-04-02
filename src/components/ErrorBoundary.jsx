import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-background p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Algo deu errado</h2>
          <p className="text-muted-foreground text-sm mb-2 max-w-md">
            Ocorreu um erro inesperado. Seus dados foram preservados.
          </p>
          <p className="text-xs text-red-500 mb-6 max-w-md font-mono bg-red-50 p-2 rounded">
            {this.state.error?.message}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); }}
              className="px-4 py-2 rounded-lg border border-input bg-background text-sm hover:bg-muted transition-colors"
            >
              Tentar novamente
            </button>
            <button
              onClick={() => { window.location.href = "/"; }}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}