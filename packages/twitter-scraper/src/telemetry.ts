import { trace, SpanStatusCode, type Attributes } from "@opentelemetry/api";
import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

export function startTelemetry() {
    if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT && !process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT)
        return;
    const provider = new NodeTracerProvider({
        spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ timeoutMillis: 10_000 }))],
    });
    provider.register();
    return provider;
}

export function withSpan<T>(
    name: string,
    attributes: Attributes,
    fn: () => Promise<T>,
): Promise<T> {
    return trace
        .getTracer("comifuro-scraper")
        .startActiveSpan(name, { attributes }, async (span) => {
            try {
                const result = await fn();
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (error) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error instanceof Error ? error.message : "operation failed",
                });
                if (error instanceof Error) span.recordException(error);
                throw error;
            } finally {
                span.end();
            }
        });
}

export function traceIds() {
    const context = trace.getActiveSpan()?.spanContext();
    return context ? { traceId: context.traceId, spanId: context.spanId } : {};
}
