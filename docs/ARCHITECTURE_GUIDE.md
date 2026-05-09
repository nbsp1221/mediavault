# Mediavault Architecture Guide

Status: Historical reference only  
Last reviewed: 2026-04-02  
Superseded by:

- `docs/architecture/personal-video-vault-target-architecture.md`
- `docs/roadmap/current-refactor-status.md`
- `docs/roadmap/personal-video-vault-rearchitecture-phases.md`

## Important note

This document reflects an earlier architecture direction and is no longer the source of truth for the live refactor.

Do not use this file to decide the current target architecture, migration order, or active ownership boundaries.

Use it only as historical background for how the project used to reason about its structure.

The current source of truth is:

- north star: `docs/architecture/personal-video-vault-target-architecture.md`
- current execution state: `docs/roadmap/current-refactor-status.md`
- phase definitions: `docs/roadmap/personal-video-vault-rearchitecture-phases.md`

---

**Version**: 2.0  
**Created**: 2025-01-07  
**Target**: Personal video streaming server  
**Tech Stack**: React Router v7 + TypeScript + Bun

## 🎯 **Executive Summary**

This guide consolidates architectural decisions for Mediavault, a personal media streaming vault. After analyzing various patterns (DDD, Clean Architecture, Hexagonal Architecture), we've concluded that **MVC + UseCase + Repository** provides the optimal balance of maintainability and simplicity for this project's scope.

### Key Principles
- **Pragmatic over Perfect**: Choose appropriate complexity for project scale
- **YAGNI**: You Aren't Gonna Need It - avoid over-engineering
- **Context-Aware**: Single-user personal project ≠ enterprise application
- **Maintainable**: Easy to understand and modify for one developer

The remaining sections in this document are archived proposal material from that earlier architecture discussion.

---

## 📊 **Project Context Analysis**

### **What This Is**
- Personal video streaming server
- Single user (owner only)
- Local network access
- 100-500 video files typical
- Simple CRUD operations
- Minimal business logic

### **What This Is NOT**
- Multi-tenant SaaS platform
- High-concurrency system
- Complex business domain
- Financial/medical critical system
- Team development project

### **Conclusion**: Lightweight architecture patterns are optimal.

---

## 🏗️ **Historical Chosen Architecture: MVC + UseCase + Repository**

### **Why This Pattern?**

Based on analysis of enterprise patterns and our project context:

1. **MVC Foundation**: Well-understood, battle-tested pattern
2. **UseCase Addition**: Cleanly separates business logic from routes
3. **Repository Pattern**: Already well-implemented, provides data abstraction
4. **No CQRS**: Read/write operations aren't complex enough to justify separation
5. **No Domain Layer**: Business rules are simple, don't need complex domain modeling

### **Pattern Comparison**

| Pattern | Complexity | Learning Curve | Project Fit | Decision |
|---------|------------|----------------|-------------|----------|
| Simple MVC | Low | Low | Good | ✅ Base |
| MVC + UseCase | Medium | Medium | Excellent | ✅ **Chosen** |
| Clean Architecture | High | High | Over-engineered | ❌ Too much |
| DDD + CQRS | Very High | Very High | Massive overkill | ❌ Way too much |

---

## 📁 **Folder Structure**

### **Historical Structure At The Time**
```
app/
├── routes/api/              # Route handlers (thick, 80+ lines)
├── services/               # Mixed responsibilities
├── repositories/           # ✅ Well implemented
├── components/             # ✅ React components  
└── types/                  # ✅ TypeScript definitions
```

### **Historical Target Structure**
```
app/
├── modules/                # 🆕 Domain-based organization
│   ├── video/
│   │   ├── add-video/
│   │   │   ├── add-video.route.ts      # Thin controller
│   │   │   ├── add-video.service.ts    # UseCase logic
│   │   │   └── add-video.types.ts      # Request/Response types
│   │   ├── delete-video/
│   │   ├── update-video/
│   │   ├── list-videos/
│   │   └── get-video/
│   └── auth/
│       ├── login/
│       ├── setup/
│       └── logout/
│
├── repositories/           # ✅ Keep existing (already excellent)
├── services/              # 🔄 Infrastructure services only
│   ├── file-manager.server.ts
│   ├── thumbnail-generator.server.ts
│   └── encryption.server.ts
│
├── lib/                   # 🆕 Shared utilities
│   ├── errors/
│   ├── result.ts
│   ├── job-queue.ts
│   └── validation.ts
│
├── components/            # ✅ Keep existing
├── types/                 # ✅ Keep existing
└── configs/               # ✅ Keep existing
```

### **Benefits of This Structure**
- 🔍 **Discoverability**: "Where's video upload?" → `modules/video/add-video/`
- 🧩 **Cohesion**: Related files grouped together
- 🔧 **Maintenance**: Modify feature in one folder
- 🚀 **Scalability**: Easy to add new features
- 👥 **Team Friendly**: Clear ownership boundaries (though single developer here)

---

## 💻 **Implementation Patterns**

### **1. Route Handler (Controller) - Keep Thin**
```typescript
// app/modules/video/add-video/add-video.route.ts
export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  
  try {
    const body = await request.json();
    const result = await addVideoUseCase(body, createDependencies());
    
    return result.success 
      ? Response.json({ success: true, data: result.data })
      : Response.json({ success: false, error: result.error });
      
  } catch (error) {
    return handleUnexpectedError(error);
  }
}
```

### **2. UseCase (Service) - Business Logic**
```typescript
// app/modules/video/add-video/add-video.service.ts
export type AddVideoDependencies = {
  videoRepository: VideoRepository;
  fileManager: typeof import('~/services/file-manager.server');
  logger: Logger;
};

export async function addVideoUseCase(
  request: AddVideoRequest,
  deps: AddVideoDependencies
): Promise<Result<Video, DomainError>> {
  const { videoRepository, fileManager, logger } = deps;
  
  // 1. Input validation
  const validation = validateAddVideoRequest(request);
  if (!validation.success) {
    return validation;
  }
  
  // 2. Business logic
  try {
    logger.info('Adding video to library', { filename: request.filename });
    
    const videoId = generateVideoId();
    await fileManager.moveToLibrary(request.filename, videoId);
    
    const metadata = await extractVideoMetadata(request.filename);
    const video = createVideoEntity({
      id: videoId,
      title: request.title,
      tags: request.tags,
      metadata
    });
    
    await videoRepository.save(video);
    
    logger.info('Video added successfully', { videoId });
    return Result.ok(video);
    
  } catch (error) {
    logger.error('Failed to add video', error);
    return Result.fail(new VideoAdditionError(error.message));
  }
}

// Pure helper functions
function validateAddVideoRequest(request: AddVideoRequest): Result<void, ValidationError> {
  if (!request.filename?.trim()) {
    return Result.fail(new ValidationError('Filename is required'));
  }
  if (!request.title?.trim()) {
    return Result.fail(new ValidationError('Title is required'));
  }
  return Result.ok(undefined);
}

function createVideoEntity(props: CreateVideoProps): Video {
  return {
    id: props.id,
    title: props.title.trim(),
    tags: props.tags.filter(tag => tag.trim().length > 0),
    metadata: props.metadata,
    addedAt: new Date()
  };
}
```

### **3. Repository (Already Excellent) - Keep As Is**
```typescript
// Current implementation is already optimal
export class JsonVideoRepository extends BaseJsonRepository<Video> {
  // Well-implemented with proper interfaces ✅
  // Good concurrency control with JsonWriteQueue ✅ 
  // Clean separation of concerns ✅
}
```

### **4. Result Pattern - Type-Safe Error Handling**
```typescript
// app/lib/result.ts
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export const Result = {
  ok: <T>(data: T): Result<T> => ({ success: true, data }),
  fail: <E>(error: E): Result<never, E> => ({ success: false, error })
};

// Usage with pattern matching
if (result.success) {
  console.log(result.data); // TypeScript knows this is T
} else {
  console.error(result.error); // TypeScript knows this is E
}
```

---

## 🔄 **Historical Migration Strategy**

### **Phase 1: Structure Setup (Week 1)**
```bash
# Create new folder structure
mkdir -p app/modules/{video,auth}
mkdir -p app/modules/video/{add-video,delete-video,update-video,list-videos,get-video}
mkdir -p app/modules/auth/{login,setup,logout}
mkdir -p app/lib/{errors}

# Create base files
touch app/lib/result.ts
touch app/lib/job-queue.ts
```

### **Phase 2: Migrate Complex Route (Week 2)**
**Target**: `app/routes/api/add-to-library.ts` (97 lines → 15 lines)

1. **Extract UseCase Logic**
   ```typescript
   // Move business logic from route to service
   // app/modules/video/add-video/add-video.service.ts
   ```

2. **Update Route Handler**
   ```typescript
   // Simplify route to just call UseCase
   // app/modules/video/add-video/add-video.route.ts
   ```

3. **Test Both Versions**
   ```typescript
   // Keep old route as backup until new version proven
   ```

### **Phase 3: Migrate Other Routes (Week 3-4)**
Apply same pattern to:
- Delete video
- Update video  
- List videos
- Auth routes

### **Phase 4: Cleanup (Week 5)**
- Remove old routes
- Update route configuration
- Clean up unused files

---

## 🛠️ **Critical Fixes**

### **1. Unified Error Handling**
**Problem**: Inconsistent error responses across routes

**Solution**: Standardized error handling
```typescript
// app/lib/errors/index.ts
export abstract class DomainError extends Error {
  abstract statusCode: number;
  abstract code: string;
}

export class VideoNotFoundError extends DomainError {
  statusCode = 404;
  code = 'VIDEO_NOT_FOUND';
  
  constructor(id: string) {
    super(`Video not found: ${id}`);
  }
}

// app/lib/errors/error-handler.ts
export function handleError(error: unknown): Response {
  if (error instanceof DomainError) {
    return Response.json({
      success: false,
      code: error.code,
      message: error.message
    }, { status: error.statusCode });
  }
  
  logger.error('Unexpected error:', error);
  return Response.json({
    success: false,
    message: 'Internal server error'
  }, { status: 500 });
}
```

---

## 🧪 **Testing Strategy**

### **Focus Areas**
1. **UseCase Functions**: Easy to test (pure functions with dependencies)
2. **Repository Layer**: Already well tested ✅
3. **Route Integration**: Light testing (happy path + error cases)

### **Example UseCase Test**
```typescript
// app/modules/video/add-video/add-video.test.ts
describe('addVideoUseCase', () => {
  const mockDeps = {
    videoRepository: createMockRepository(),
    fileManager: createMockFileManager(),
    logger: createMockLogger()
  };

  it('should add video successfully', async () => {
    const request = {
      filename: 'test.mp4',
      title: 'Test Video',
      tags: ['action']
    };

    const result = await addVideoUseCase(request, mockDeps);

    expect(result.success).toBe(true);
    expect(mockDeps.videoRepository.save).toHaveBeenCalledOnce();
  });

  it('should fail with empty filename', async () => {
    const request = { filename: '', title: 'Test', tags: [] };
    
    const result = await addVideoUseCase(request, mockDeps);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(ValidationError);
  });
});
```

---

## 🚫 **What We're NOT Doing (And Why)**

### **CQRS (Command Query Responsibility Segregation)**
**Why Not**: 
- Read/write operations aren't complex
- No performance bottlenecks requiring separation
- JSON file storage doesn't benefit from CQRS
- Adds unnecessary complexity for single user

### **Domain-Driven Design (Full DDD)**
**Why Not**:
- Domain isn't complex (Video, User, Session)
- No domain experts to collaborate with
- Business rules are simple
- Value objects would be overkill

### **Event Sourcing**
**Why Not**:
- No need for audit trails
- State changes are simple
- Personal use doesn't require event replay
- JSON storage doesn't support it well

### **Microservices**
**Why Not**:
- Single user, single deployment
- No team boundaries to enforce
- No independent scaling needs
- Network overhead would hurt performance

---

## 📈 **Success Metrics**

### **Phase 1 Complete When**:
- [ ] New folder structure created
- [ ] One UseCase successfully extracted
- [ ] Route handler reduced from 80+ lines to <20 lines
- [ ] Tests pass for extracted UseCase

### **Phase 2 Complete When**:
- [ ] All major routes converted to UseCase pattern
- [ ] Error handling standardized
- [ ] FFmpeg concurrency controlled
- [ ] No functionality regression

### **Overall Success When**:
- [ ] New features can be added in 30 minutes (vs current 2+ hours)
- [ ] Bug fixes require touching only one module
- [ ] Code is self-documenting (obvious where things belong)
- [ ] Maintenance overhead reduced

---

## 🎯 **Why This Architecture Works for Mediavault**

### **Right-Sized Complexity**
- **Not too simple**: Plain MVC would mix business logic in controllers
- **Not too complex**: Full DDD/CQRS would be 10x more code for same features
- **Just right**: Clean separation with minimal overhead

### **Maintenance Benefits**
- **Single developer friendly**: Easy to remember where things are
- **Future-proof**: Can add complexity later if needed  
- **Refactoring safe**: Clear boundaries make changes predictable

### **Performance Considerations**
- **No over-abstraction**: Direct repository calls, no unnecessary layers
- **Efficient**: UseCase functions are lightweight
- **Scalable**: Pattern works for 10 videos or 10,000 videos

---

## ⚡ **Performance Considerations**

### **Current System Architecture (HLS-Based)**

Mediavault has fully migrated to HLS (HTTP Live Streaming) with AES-128 encryption to meet security requirements. All performance optimizations must work within this HLS framework.

### **Static File Serving Performance**

**Benchmark Data (2025):**
```
nginx:           15,592 req/sec (2-3x faster than Node.js)
express.static:   6,459 req/sec (current Node.js approach)
node-static:      7,565 req/sec
```

**nginx Advantages for HLS Streaming:**
- **sendfile syscall**: OS kernel-level file transfer (fastest possible)
- **Native range request handling**: No Chrome request flooding issues
- **C implementation**: Minimal memory footprint vs JavaScript
- **HLS segment caching**: Efficient .ts file serving

### **Recommended Performance Optimizations**

#### **1. nginx + HLS Hybrid Architecture**
```
Browser → nginx (HLS segments) + React Router (authentication/tokens)
```

**Benefits:**
- 2-3x performance improvement for video streaming
- Maintains authentication/security through React Router
- nginx handles .ts segments and .m3u8 playlists efficiently

#### **2. FFmpeg Concurrency Control**

**Critical Issue**: Multiple simultaneous FFmpeg processes can crash personal computers.

**Solution - Simple Queue System:**
```typescript
export class SimpleJobQueue {
  private running = 0;
  private readonly maxConcurrent = 1; // Personal PC limit
  
  async add<T>(job: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.running++;
    try {
      return await job();
    } finally {
      this.running--;
    }
  }
}
```

#### **3. Route Handler Optimization**

**Current Issue**: Some route handlers exceed 80+ lines with mixed responsibilities.

**Target Pattern:**
```typescript
// Thin controller (< 20 lines)
export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  
  try {
    const body = await request.json();
    const result = await addVideoUseCase(body, createDependencies());
    
    return result.success 
      ? Response.json({ success: true, data: result.data })
      : Response.json({ success: false, error: result.error });
      
  } catch (error) {
    return handleUnexpectedError(error);
  }
}
```

### **Performance Monitoring**

**Key Metrics to Track:**
- HLS segment delivery time
- Token refresh overhead
- FFmpeg processing queue length
- Memory usage during video operations

**Testing Commands:**
```bash
# Test HLS streaming performance
time curl -H "Range: bytes=0-1048575" http://localhost/videos/{id}/segment-001.ts

# Monitor FFmpeg processes
ps aux | grep ffmpeg | wc -l
```

### **Hardware Considerations**

**Current System Requirements:**
- **Minimum**: 4GB RAM, dual-core CPU for personal use
- **Recommended**: 8GB+ RAM for multiple concurrent streams
- **Storage**: NVMe SSD recommended for HLS segment access

**Bottleneck Analysis:**
- **Not CPU**: Modern processors handle HLS easily
- **Not Storage**: Local NVMe is fast enough
- **Primary**: Network layer optimization (nginx vs Node.js)

---

## 📚 **References & Further Reading**

### **Architectural Patterns**
- [Clean Architecture by Robert Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Hexagonal Architecture by Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
- [Domain-Driven Hexagon (GitHub)](https://github.com/Sairyss/domain-driven-hexagon) - Excellent reference, but more complex than needed

### **TypeScript/Node.js Specific**
- [React Router v7 Documentation](https://reactrouter.com/)
- [Repository Pattern in TypeScript](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-pattern/)

### **Key Takeaways from Research**
> "Follow YAGNI and avoid over-complicating solutions" - Domain-Driven Hexagon

> "Complex architectures work best for projects with significant business logic" - Domain-Driven Hexagon

> "Simpler architectures (like MVC) suit CRUD applications with minimal logic" - Domain-Driven Hexagon

---

## 🏁 **Conclusion**

This architecture guide provides a **pragmatic, maintainable solution** that:

1. ✅ **Solves real problems**: Route complexity, error handling, FFmpeg concurrency
2. ✅ **Avoids over-engineering**: No unnecessary patterns for simple domain
3. ✅ **Scales appropriately**: Can grow with project needs
4. ✅ **Developer friendly**: Easy to understand and modify
5. ✅ **Battle tested**: MVC + UseCase + Repository is proven pattern

**Remember**: The best architecture is the one that solves your problems without creating new ones. For Mediavault, this balanced approach provides clean code organization without enterprise-level complexity.

---

*"Perfect is the enemy of good. This architecture is good enough to be great."*
