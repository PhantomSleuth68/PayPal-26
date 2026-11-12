import { NextRequest, NextResponse } from 'next/server';
import { runShoppingPipeline, PipelineExecutionResult } from '../../../core/orchestrator';
import { SEED_PRODUCTS } from '../../../providers/products/seed-data';
import { resetDemoState } from '../../../core/db';
import { DEMO_SCENARIOS, DemoScenario } from '../../../core/demo-scenarios';

export const dynamic = 'force-dynamic';

function evaluateScenarioOutcome(
  scenario: DemoScenario,
  result: PipelineExecutionResult
): {
  status: 'PASS' | 'FAIL' | 'ERROR';
  passedCheck: boolean;
  actualOutcome: string;
  reason?: string;
} {
  const isAiUnavailable = Boolean(
    result.error === 'AI_UNAVAILABLE' ||
    (result.decision === 'BLOCK' &&
      (result.evaluationResult?.blockingReason === 'AI_UNAVAILABLE' ||
        result.evaluationResult?.blockingReason?.includes('AI_UNAVAILABLE')))
  );

  if (isAiUnavailable) {
    return {
      status: 'ERROR',
      passedCheck: false,
      actualOutcome: 'AI_UNAVAILABLE',
      reason: 'AI_UNAVAILABLE: Gemini model unavailable after retries (503/429/network).',
    };
  }

  if (result.decision !== scenario.expectedOutcome) {
    return {
      status: 'FAIL',
      passedCheck: false,
      actualOutcome: result.decision,
      reason: `Expected ${scenario.expectedOutcome} but received ${result.decision}`,
    };
  }

  // If BLOCK was expected, ensure the blocking reason matches the expected safety mechanism
  if (scenario.expectedOutcome === 'BLOCK') {
    const combinedReasonText = [
      result.evaluationResult?.blockingReason || '',
      result.evaluationResult?.summary || '',
      ...result.stages.map((s) => s.summary),
    ]
      .join(' ')
      .toLowerCase();

    const kw = scenario.expectedBlockingKeyword?.toLowerCase();
    let matchesKeyword = false;

    if (!kw) {
      matchesKeyword = true;
    } else if (kw === 'subscription') {
      matchesKeyword =
        combinedReasonText.includes('subscription') ||
        combinedReasonText.includes('recurring') ||
        combinedReasonText.includes('fine print');
    } else if (kw === 'price') {
      matchesKeyword =
        combinedReasonText.includes('price') ||
        combinedReasonText.includes('gouging') ||
        combinedReasonText.includes('inflation') ||
        combinedReasonText.includes('market');
    } else if (kw === 'injection') {
      matchesKeyword =
        combinedReasonText.includes('injection') ||
        combinedReasonText.includes('adversarial') ||
        combinedReasonText.includes('attack');
    } else if (kw === 'seller') {
      matchesKeyword =
        combinedReasonText.includes('seller') ||
        combinedReasonText.includes('verified') ||
        combinedReasonText.includes('return policy');
    } else {
      matchesKeyword = combinedReasonText.includes(kw);
    }

    if (!matchesKeyword) {
      return {
        status: 'FAIL',
        passedCheck: false,
        actualOutcome: result.decision,
        reason: `Blocked, but reason did not match expected safety mechanism ("${kw}"). Actual: ${result.evaluationResult?.blockingReason}`,
      };
    }
  }

  return {
    status: 'PASS',
    passedCheck: true,
    actualOutcome: result.decision,
  };
}

async function executeScenarioWithRetries(
  scenario: DemoScenario,
  runId: string
): Promise<{
  result: PipelineExecutionResult;
  evalResult: ReturnType<typeof evaluateScenarioOutcome>;
  attempts: number;
}> {
  const forcedListing = scenario.targetListingId
    ? SEED_PRODUCTS.filter((p) => p.id === scenario.targetListingId)
    : undefined;

  const scenarioHistory = scenario.seedHistory !== undefined ? scenario.seedHistory : [];

  let attempts = 0;
  const maxAttempts = 3; // 1 initial + up to 2 automatic retries on AI_UNAVAILABLE
  let lastResult: PipelineExecutionResult | null = null;
  let lastEval: ReturnType<typeof evaluateScenarioOutcome> | null = null;

  while (attempts < maxAttempts) {
    attempts++;
    const result = await runShoppingPipeline(scenario.userPrompt, {
      forcedListings: forcedListing,
      customSpendHistory: scenarioHistory,
      recordSpendInDb: false,
      autoCapturePayPal: scenario.id === 'scenario-1-auto-approve',
      runId,
    });

    const evalResult = evaluateScenarioOutcome(scenario, result);
    lastResult = result;
    lastEval = evalResult;

    if (evalResult.status === 'ERROR' && attempts < maxAttempts) {
      console.warn(`Scenario ${scenario.id} encountered AI_UNAVAILABLE; retrying (attempt ${attempts + 1}/${maxAttempts})...`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    break;
  }

  return {
    result: lastResult!,
    evalResult: lastEval!,
    attempts,
  };
}

export async function GET() {
  return NextResponse.json({ scenarios: DEMO_SCENARIOS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { scenarioId, runAll } = body;

    if (runAll) {
      const runId = `demo_run_${Date.now()}`;
      // 1. Reset state at start of run: clear purchase history, pending approvals, reset policy, turn off kill switch
      resetDemoState(runId);

      const results = [];
      for (let i = 0; i < DEMO_SCENARIOS.length; i++) {
        const scenario = DEMO_SCENARIOS[i];

        // 5. Short delay (~1s) between sequential scenarios to avoid rate limits
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const { result, evalResult, attempts } = await executeScenarioWithRetries(scenario, runId);

        results.push({
          scenarioId: scenario.id,
          scenarioTitle: scenario.title,
          expectedOutcome: scenario.expectedOutcome,
          actualOutcome: evalResult.actualOutcome,
          status: evalResult.status,
          passedCheck: evalResult.passedCheck,
          reason: evalResult.reason,
          attempts,
          orderId: result.orderId,
          captureId: result.captureId,
          result,
        });
      }
      return NextResponse.json({ success: true, runId, scenarios: results });
    }

    if (scenarioId) {
      const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
      if (!scenario) {
        return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
      }

      const runId = `demo_single_${Date.now()}`;
      const { result, evalResult, attempts } = await executeScenarioWithRetries(scenario, runId);

      return NextResponse.json({
        scenario,
        result,
        passedCheck: evalResult.passedCheck,
        status: evalResult.status,
        actualOutcome: evalResult.actualOutcome,
        reason: evalResult.reason,
        attempts,
        orderId: result.orderId,
        captureId: result.captureId,
        runId,
      });
    }

    return NextResponse.json(
      { error: 'Provide either "runAll: true" or "scenarioId"' },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
