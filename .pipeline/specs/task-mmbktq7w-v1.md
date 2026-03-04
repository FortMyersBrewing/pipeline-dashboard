# Implementation Spec: Fix Binary File Detection on Docs Screen

**Task ID**: task-mmbktq7w  
**Title**: Docs tab issue - Binary file detection problems  
**Project**: pipeline-dashboard  
**Stack**: node  
**Attempt**: 1  

## Problem Analysis

### Current Issue
When drilling down in a directory on the docs screen, files that are NOT binary are incorrectly showing "Binary file detected" error message.

### Root Cause Analysis

After analyzing the codebase, I identified two primary issues:

#### 1. API-Frontend Response Mismatch
- **Location**: `/src/routes/docs/+page.svelte` line 168
- **Issue**: Frontend checks `data.isBinary` field when API response is not OK
- **Reality**: API endpoint returns `{ error: 'Binary file detected' }` with 400 status - no `isBinary` field
- **Result**: Condition `data.isBinary` is never true, causing all binary file errors to fall through to generic error handling

#### 2. Overly Aggressive Binary Detection Logic  
- **Location**: `/src/routes/api/project-files/[project]/[...file]/+server.ts`
- **Issue**: The `isBinaryFile()` function may be incorrectly flagging text files as binary
- **Potential causes**:
  - Null byte detection reading into uninitialized buffer space
  - File reading errors being treated as "assume binary"
  - Buffer allocation issues with small files

## Detailed Technical Analysis

### Current Binary Detection Logic
```typescript
function isBinaryFile(filename: string, fullPath: string): boolean {
  // 1. Extension check (good)
  const binaryExtensions = new Set([...]);
  const ext = filename.toLowerCase().split('.').pop();
  if (ext && binaryExtensions.has(`.${ext}`)) return true;

  // 2. Null byte check (problematic)
  try {
    const buffer = Buffer.alloc(8192); // Pre-allocated buffer
    const fd = require('fs').openSync(fullPath, 'r');
    const bytesRead = require('fs').readSync(fd, buffer, 0, 8192, 0);
    require('fs').closeSync(fd);
    
    // Issue: Checking entire 8192 bytes even if file is smaller
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true;
    }
    
    return false;
  } catch (error) {
    // Issue: Defaulting to binary on any read error
    return true;
  }
}
```

### Problems Identified

1. **Buffer overread**: Loop checks `i < bytesRead` but buffer was pre-allocated to 8192 bytes
2. **Error handling**: Any file read error (permissions, etc.) assumes binary
3. **API response format**: Inconsistent between binary detection and frontend expectations

## Implementation Plan

### Phase 1: Fix API Response Format
**File**: `/src/routes/api/project-files/[project]/[...file]/+server.ts`

#### Changes Required:
1. **Return structured binary response** instead of generic error:
   ```typescript
   // Current:
   return json({ error: 'Binary file detected' }, { status: 400 });
   
   // New:
   return json({ 
     isBinary: true, 
     size: fileSize, 
     filename: filename,
     error: 'Binary file detected' 
   }, { status: 400 });
   ```

2. **Improve binary detection logic**:
   ```typescript
   function isBinaryFile(filename: string, fullPath: string): boolean {
     // Extension check (keep existing)
     const binaryExtensions = new Set([...]);
     const ext = filename.toLowerCase().split('.').pop();
     if (ext && binaryExtensions.has(`.${ext}`)) return true;

     // Improved null byte check
     try {
       const stats = statSync(fullPath);
       const fileSize = stats.size;
       
       // Don't check empty files
       if (fileSize === 0) return false;
       
       // Read up to 8KB or file size, whichever is smaller
       const sampleSize = Math.min(8192, fileSize);
       const buffer = Buffer.allocUnsafe(sampleSize);
       
       const fd = openSync(fullPath, 'r');
       const bytesRead = readSync(fd, buffer, 0, sampleSize, 0);
       closeSync(fd);
       
       // Only check bytes that were actually read
       for (let i = 0; i < bytesRead; i++) {
         if (buffer[i] === 0) return true;
       }
       
       return false;
     } catch (error) {
       // Log error for debugging but don't assume binary
       console.warn(`Could not read file for binary detection: ${fullPath}`, error);
       // Return false to allow frontend to attempt to display the file
       // and let it handle the read error appropriately
       return false;
     }
   }
   ```

3. **Add file type detection**:
   ```typescript
   function getFileType(filename: string): 'markdown' | 'text' {
     const ext = filename.toLowerCase().split('.').pop();
     if (ext && ['.md', '.markdown'].includes(`.${ext}`)) {
       return 'markdown';
     }
     return 'text';
   }
   ```

4. **Enhanced response for successful file reads**:
   ```typescript
   return json({
     content,
     path: filePath,
     size: fileSize,
     truncated,
     type: getFileType(filePath),
     filename: filePath.split('/').pop() || 'unknown'
   });
   ```

### Phase 2: Fix Frontend Binary Handling
**File**: `/src/routes/docs/+page.svelte`

#### Changes Required:
1. **Fix binary detection check**:
   ```typescript
   // Current (line 168):
   if (data.isBinary) {
     error = `Binary file detected (${formatFileSize(data.size)})`;
     fileContent = '';
   }
   
   // Fixed:
   if (data.isBinary) {
     error = `Binary file detected: ${data.filename} (${formatFileSize(data.size)})`;
     fileContent = '';
     fileType = 'text';
   }
   ```

2. **Improve error messaging**:
   ```typescript
   try {
     const res = await fetch(`/api/project-files/${selectedProject.id}/${encodeURIComponent(node.path)}`);
     const data = await res.json();
     
     if (!res.ok) {
       if (data.isBinary) {
         error = `Cannot display binary file: ${data.filename} (${formatFileSize(data.size)})`;
         fileContent = '';
         fileType = 'text';
       } else {
         error = data.error || 'Failed to load file';
         fileContent = '';
       }
       return;
     }
     
     // Success case
     fileContent = data.content;
     fileType = data.type;
     error = '';
   } catch (e) {
     error = `Network error: ${e.message}`;
     fileContent = '';
   }
   ```

3. **Add file size warnings for large text files**:
   ```typescript
   if (data.truncated) {
     error = `File truncated: Only showing first ${formatFileSize(MAX_FILE_SIZE)} of ${formatFileSize(data.size)}`;
   }
   ```

### Phase 3: Enhanced Binary File Support
**File**: Both API and frontend

#### Add support for displayable binary files:
1. **Image preview capability**:
   ```typescript
   // In API response for binary images
   if (isImageFile(filename)) {
     return json({
       isBinary: true,
       isImage: true,
       size: fileSize,
       filename: filename,
       path: filePath,
       mimeType: getMimeType(filename)
     });
   }
   ```

2. **Frontend image display**:
   ```svelte
   {#if error}
     <div class="p-6">
       {#if error.includes('Cannot display binary file') && selectedFileNode?.name.match(/\.(png|jpg|jpeg|gif|webp)$/i)}
         <div class="text-xs text-text-muted mb-4">{error}</div>
         <img src="/api/project-files/{selectedProject.id}/{encodeURIComponent(selectedFile)}?raw=true" 
              alt={selectedFileNode.name} 
              class="max-w-full h-auto border border-border rounded" />
       {:else}
         <div class="text-xs text-error">{error}</div>
       {/if}
     </div>
   ```

## Files to Modify

### 1. `/src/routes/api/project-files/[project]/[...file]/+server.ts`
- **Changes**: 80% of function logic
- **Risk Level**: Medium
- **Testing**: Unit tests for binary detection, API response format

### 2. `/src/routes/docs/+page.svelte`
- **Changes**: Error handling section (lines 160-175)  
- **Risk Level**: Low
- **Testing**: UI testing with various file types

## Expected Behavior After Fix

### For Text Files (Markdown, Code, etc.):
- ✅ Display content correctly
- ✅ Show appropriate file type styling
- ✅ Handle truncation messages for large files

### For Binary Files:
- ✅ Show clear "Cannot display binary file" message with file name and size
- ✅ For images: Optional preview capability
- ✅ Provide file metadata (size, type)

### Error Cases:
- ✅ Permission errors: Clear message, not assumed binary
- ✅ Network errors: Distinct from binary detection errors
- ✅ File not found: Proper 404 handling

## Testing Approach

### Unit Tests
1. **Binary detection function tests**:
   ```typescript
   describe('isBinaryFile', () => {
     it('should detect text files correctly', () => {
       // Test .md, .txt, .js files
     });
     
     it('should detect binary files by extension', () => {
       // Test .png, .jpg, .pdf files
     });
     
     it('should detect binary files by null bytes', () => {
       // Test files with embedded null bytes
     });
     
     it('should handle empty files', () => {
       // Test zero-byte files
     });
     
     it('should handle permission errors gracefully', () => {
       // Test unreadable files
     });
   });
   ```

### Integration Tests
1. **API endpoint tests**:
   - Test with various file types
   - Test response format consistency
   - Test error cases

2. **Frontend UI tests**:
   - Navigate to docs page
   - Select different file types
   - Verify error messages
   - Test loading states

### Manual Testing Checklist
- [ ] Select a text file → displays content
- [ ] Select a markdown file → renders markdown
- [ ] Select a binary file → shows binary message
- [ ] Select large text file → shows truncation warning
- [ ] Test with non-existent file → shows 404 error
- [ ] Test with permission-denied file → shows access error

## Security Considerations

### Path Traversal Protection
- ✅ Existing protection is adequate
- ✅ No changes needed to path validation logic

### File Access Control
- ✅ Maintain current project-based access restrictions
- ✅ No changes to authentication/authorization

## Performance Considerations

### Binary Detection Optimization
- ✅ Read only first 8KB for null byte detection
- ✅ Use `allocUnsafe` for better performance with small buffers
- ✅ Early return for extension-based detection

### File Caching
- ⚠️ Consider adding basic file content caching for frequently accessed files (future enhancement)

## Rollback Plan

### If Issues Arise:
1. **Revert API changes**: Restore original binary detection logic
2. **Revert frontend changes**: Restore original error handling
3. **Emergency fix**: Add feature flag to disable new binary detection

### Monitoring:
- Monitor error logs for binary detection failures
- Track user reports of incorrect binary classification
- Monitor API response times for file operations

## Acceptance Criteria

✅ **AC1**: Text files (.md, .txt, .js, .ts, etc.) display content correctly  
✅ **AC2**: Binary files (.png, .pdf, .exe, etc.) show appropriate binary file message  
✅ **AC3**: Error messages clearly distinguish between binary files and read errors  
✅ **AC4**: File size and filename included in binary file messages  
✅ **AC5**: Large text files show truncation warnings when applicable  
✅ **AC6**: Empty files handle gracefully without binary detection  
✅ **AC7**: Permission errors don't trigger false binary detection  
✅ **AC8**: API responses include consistent `isBinary` field when applicable  
✅ **AC9**: Frontend error handling matches API response format  
✅ **AC10**: No regression in existing file browsing functionality  

## Timeline Estimate

- **Phase 1** (API fixes): 2-3 hours
- **Phase 2** (Frontend fixes): 1-2 hours  
- **Phase 3** (Binary preview): 3-4 hours
- **Testing**: 2-3 hours
- **Total**: 8-12 hours

## Dependencies

- No external dependencies required
- No database schema changes needed
- No new npm packages required

---

**Spec Version**: v1  
**Date**: 2026-03-04  
**Author**: Scout Agent  
**Status**: Ready for Implementation