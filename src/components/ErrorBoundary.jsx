import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error caught by ErrorBoundary:', error, errorInfo);
        this.setState({
            error,
            errorInfo
        });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
                    <Card className="max-w-2xl w-full border-red-200 shadow-lg">
                        <CardHeader className="bg-red-50 border-b border-red-100">
                            <CardTitle className="flex items-center gap-3 text-red-700">
                                <AlertTriangle className="w-6 h-6" />
                                Une erreur s'est produite
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="bg-white rounded-lg p-4 border border-gray-200">
                                <p className="text-gray-700 mb-2">
                                    L'application a rencontré une erreur inattendue. Ne vous inquiétez pas, vos données sont en sécurité.
                                </p>
                                {this.state.error && (
                                    <details className="mt-4">
                                        <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 font-medium">
                                            Détails techniques
                                        </summary>
                                        <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200 overflow-auto">
                                            <p className="text-xs font-mono text-red-600 mb-2">
                                                {this.state.error.toString()}
                                            </p>
                                            {this.state.errorInfo && (
                                                <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                                                    {this.state.errorInfo.componentStack}
                                                </pre>
                                            )}
                                        </div>
                                    </details>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    onClick={this.handleReset}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Recharger l'application
                                </Button>
                            </div>

                            <p className="text-xs text-gray-500 text-center">
                                Si le problème persiste, veuillez contacter le support technique.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
