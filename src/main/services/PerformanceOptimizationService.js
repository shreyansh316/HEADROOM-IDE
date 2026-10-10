/**
 * HEADROOM Desktop IDE — Performance & Startup Optimization Service
 *
 * Implements PHASE-30 (HR-204 through HR-210):
 * - HR-204: Cold & Warm Startup Latency Milestone Tracking (Telemetry/Benchmarks)
 * - HR-205: Lazy Service Initialization & Deferred Loading of Heavy Modules
 * - HR-206: Resident Set Size (RSS) Memory Monitoring & GC Optimization
 * - HR-207: Asynchronous Stream Chunk Buffering & Backpressure Management
 * - HR-208: Large File Memory Mapping & Virtualized Buffer Windowing
 * - HR-209: Asset & Bundle Size Constraint Enforcement (<50MB target)
 * - HR-210: Background Worker Idle Power & CPU Throttle Optimization
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class PerformanceOptimizationService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.startTime = Date.now();
        this.milestones = new Map();
        this.lazyFactories = new Map();
        this.initializedServices = new Map();
        this.idleThrottleActive = false;
        this.recordMilestone('service_constructed');
    }

    /**
     * HR-204: Cold & Warm Startup Latency Milestone Tracking
     */
    recordMilestone(name) {
        const timestamp = Date.now();
        const elapsedMs = timestamp - this.startTime;
        this.milestones.set(name, {
            name,
            timestamp,
            elapsedMs
        });
        this.emit('milestone', { name, elapsedMs });
        return { name, elapsedMs };
    }

    getMilestones() {
        return Array.from(this.milestones.values());
    }

    getStartupDurationMs() {
        return Date.now() - this.startTime;
    }

    /**
     * HR-205: Lazy Service Initialization & Deferred Loading of Heavy Modules
     */
    registerLazyService(name, factoryFn) {
        this.lazyFactories.set(name, factoryFn);
    }

    getService(name) {
        if (this.initializedServices.has(name)) {
            return this.initializedServices.get(name);
        }
        if (!this.lazyFactories.has(name)) {
            throw new Error(`Service "${name}" is not registered in lazy service registry`);
        }
        const start = Date.now();
        const instance = this.lazyFactories.get(name)();
        this.initializedServices.set(name, instance);
        this.recordMilestone(`service_loaded_${name}`);
        this.emit('serviceLazyLoaded', { name, loadDurationMs: Date.now() - start });
        return instance;
    }

    /**
     * HR-206: Resident Set Size (RSS) Memory Monitoring & GC Optimization
     */
    getMemoryMetrics() {
        const mem = process.memoryUsage();
        const rssMb = (mem.rss / (1024 * 1024)).toFixed(2);
        const heapUsedMb = (mem.heapUsed / (1024 * 1024)).toFixed(2);
        const heapTotalMb = (mem.heapTotal / (1024 * 1024)).toFixed(2);

        return {
            rssBytes: mem.rss,
            rssMb: parseFloat(rssMb),
            heapUsedMb: parseFloat(heapUsedMb),
            heapTotalMb: parseFloat(heapTotalMb),
            externalMb: parseFloat((mem.external / (1024 * 1024)).toFixed(2)),
            recommendedAction: mem.rss > 500 * 1024 * 1024 ? 'COLLECT_GARBAGE' : 'HEALTHY'
        };
    }

    /**
     * HR-207: Asynchronous Stream Chunk Buffering & Backpressure Management
     */
    createBackpressureBuffer(maxBufferedChunks = 100, onDrain = null) {
        const buffer = [];
        let paused = false;

        return {
            push: (chunk) => {
                buffer.push(chunk);
                if (buffer.length >= maxBufferedChunks) {
                    paused = true;
                }
                return !paused;
            },
            pull: () => {
                const chunk = buffer.shift();
                if (paused && buffer.length < maxBufferedChunks / 2) {
                    paused = false;
                    if (onDrain) onDrain();
                }
                return chunk;
            },
            isPaused: () => paused,
            size: () => buffer.length
        };
    }

    /**
     * HR-208: Large File Memory Mapping & Virtualized Buffer Windowing
     */
    readFileWindow(filePath, offsetBytes = 0, lengthBytes = 64 * 1024) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }
        const stat = fs.statSync(filePath);
        const totalSize = stat.size;

        const effectiveOffset = Math.min(offsetBytes, totalSize);
        const effectiveLength = Math.min(lengthBytes, totalSize - effectiveOffset);

        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(effectiveLength);
        fs.readSync(fd, buffer, 0, effectiveLength, effectiveOffset);
        fs.closeSync(fd);

        return {
            totalSize,
            offset: effectiveOffset,
            length: effectiveLength,
            hasMore: effectiveOffset + effectiveLength < totalSize,
            content: buffer.toString('utf8')
        };
    }

    /**
     * HR-209: Asset & Bundle Size Constraint Enforcement (<50MB target)
     */
    auditBundleSize(targetDir, maxAllowedBytes = 50 * 1024 * 1024) {
        if (!fs.existsSync(targetDir)) {
            return { totalBytes: 0, totalMb: 0, compliant: true, fileCount: 0 };
        }

        let totalBytes = 0;
        let fileCount = 0;

        const traverse = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    traverse(fullPath);
                } else if (entry.isFile()) {
                    totalBytes += fs.statSync(fullPath).size;
                    fileCount++;
                }
            }
        };

        traverse(targetDir);
        const totalMb = parseFloat((totalBytes / (1024 * 1024)).toFixed(2));
        const compliant = totalBytes <= maxAllowedBytes;

        return {
            directory: targetDir,
            totalBytes,
            totalMb,
            maxAllowedMb: maxAllowedBytes / (1024 * 1024),
            fileCount,
            compliant
        };
    }

    /**
     * HR-210: Background Worker Idle Power & CPU Throttle Optimization
     */
    setIdlePowerThrottle(enable = true) {
        this.idleThrottleActive = enable;
        this.emit('idleThrottleChanged', { enabled: enable });
        return {
            idleThrottleActive: this.idleThrottleActive,
            suggestedPollingIntervalMs: enable ? 5000 : 500
        };
    }
}

module.exports = PerformanceOptimizationService;
