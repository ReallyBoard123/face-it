"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, ArrowLeft, RefreshCw, Server, Brain, Info } from "lucide-react";
import Link from "next/link";

interface TestResult {
  name: string;
  status: 'success' | 'error' | 'pending';
  message: string;
  data?: any;
  timestamp?: string;
}

export default function TestPage() {
  const [tests, setTests] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runTest = async (testName: string, endpoint: string) => {
    const testIndex = tests.findIndex(t => t.name === testName);
    const newTests = [...tests];
    
    if (testIndex >= 0) {
      newTests[testIndex] = { ...newTests[testIndex], status: 'pending' };
    } else {
      newTests.push({ name: testName, status: 'pending', message: 'Running...' });
    }
    setTests(newTests);

    try {
      const response = await fetch(`http://localhost:8000${endpoint}`);
      const result = await response.json();

      const updatedTestIndex = newTests.findIndex(t => t.name === testName);
      if (response.ok) {
        newTests[updatedTestIndex] = {
          name: testName,
          status: 'success',
          message: result.message || 'Test passed',
          data: result,
          timestamp: result.timestamp
        };
      } else {
        newTests[updatedTestIndex] = {
          name: testName,
          status: 'error',
          message: result.detail?.message || result.message || 'Test failed',
          data: result,
          timestamp: result.detail?.timestamp || result.timestamp
        };
      }
    } catch (error) {
      const updatedTestIndex = newTests.findIndex(t => t.name === testName);
      newTests[updatedTestIndex] = {
        name: testName,
        status: 'error',
        message: error instanceof Error ? error.message : 'Network error',
      };
    }

    setTests([...newTests]);
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setTests([]);

    const testSuite = [
      { name: 'Backend Health Check', endpoint: '/health' },
      { name: 'py-feat Installation', endpoint: '/test-pyfeat' },
      { name: 'Detector Information', endpoint: '/detector-info' },
    ];

    for (const test of testSuite) {
      await runTest(test.name, test.endpoint);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsRunning(false);
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'pending':
        return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
    }
  };

  const getStatusBadge = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Running...</Badge>;
    }
  };

  const successCount = tests.filter(t => t.status === 'success').length;
  const errorCount = tests.filter(t => t.status === 'error').length;
  const allTestsComplete = tests.length > 0 && tests.every(t => t.status !== 'pending');

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Backend Connection Test
            </h1>
            <p className="text-muted-foreground">
              Verify that all backend services are working correctly
            </p>
          </div>
        </div>

        <Separator />

        {/* Test Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Server className="h-5 w-5" />
              <span>System Tests</span>
            </CardTitle>
            <CardDescription>
              Run comprehensive tests to ensure your facial expression analysis system is ready
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <Button 
                onClick={runAllTests}
                disabled={isRunning}
                size="lg"
                className="min-w-48"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Running Tests...
                  </>
                ) : (
                  <>
                    <Brain className="mr-2 h-4 w-4" />
                    Run All Tests
                  </>
                )}
              </Button>

              {allTestsComplete && (
                <div className="text-sm text-muted-foreground">
                  ✅ {successCount} passed, ❌ {errorCount} failed
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Test Results */}
        {tests.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Test Results</h2>
            
            {tests.map((test, index) => (
              <Card key={index} className={
                test.status === 'success' ? 'border-green-200 bg-green-50/50' :
                test.status === 'error' ? 'border-red-200 bg-red-50/50' :
                'border-blue-200 bg-blue-50/50'
              }>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      {getStatusIcon(test.status)}
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h3 className="font-medium">{test.name}</h3>
                          {getStatusBadge(test.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{test.message}</p>
                        
                        {test.timestamp && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(test.timestamp).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Detailed Results */}
                  {test.data && test.status === 'success' && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                        View Details
                      </summary>
                      <div className="mt-2 p-3 bg-muted rounded-lg">
                        <pre className="text-xs overflow-auto">
                          {JSON.stringify(test.data, null, 2)}
                        </pre>
                      </div>
                    </details>
                  )}

                  {/* Error Details */}
                  {test.data && test.status === 'error' && (
                    <div className="mt-4 p-3 bg-red-100 border border-red-200 rounded-lg">
                      <div className="text-sm text-red-800">
                        <strong>Error Details:</strong>
                      </div>
                      <pre className="text-xs text-red-700 mt-1 overflow-auto">
                        {JSON.stringify(test.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Info className="h-5 w-5" />
              <span>Troubleshooting</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">If tests fail:</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Make sure the backend server is running on port 8000</li>
                  <li>Check that py-feat is properly installed: <code className="bg-muted px-1 rounded">pip install py-feat</code></li>
                  <li>Verify scipy version compatibility: <code className="bg-muted px-1 rounded">pip install scipy==1.9.3</code></li>
                  <li>Ensure CORS is properly configured for localhost:3000</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Backend startup:</h4>
                <pre className="bg-muted p-2 rounded text-sm">
cd backend && python app.py
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Success Message */}
        {allTestsComplete && errorCount === 0 && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-6 text-center">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-800 mb-2">
                All Tests Passed! 🎉
              </h3>
              <p className="text-green-700 mb-4">
                Your facial expression analysis system is ready to use.
              </p>
              <Link href="/record">
                <Button size="lg">
                  Start Recording
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}