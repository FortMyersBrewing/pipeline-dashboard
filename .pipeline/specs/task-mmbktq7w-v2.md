# Implementation Spec: Fix Binary File Detection + Repository Hygiene

**Task ID**: task-mmbktq7w  
**Title**: Docs tab issue - Binary file detection problems  
**Project**: pipeline-dashboard  
**Stack**: node  
**Attempt**: 2  

## Problem Analysis

### Primary Issue
When drilling down in a directory on the docs screen, files that are NOT binary are incorrectly showing "Binary file detected" error message.

### Secondary Issue (Critical for Acceptance)
**Repository Hygiene Problems** - The following files should not be committed to version control:
- `pipeline.db-wal` (SQLite write-ahead log) - currently tracked and modified
- `docs/.PIPELINE-SPEC.md.swp` (vim swap file) - present in file system
- Missing gitignore entries for common editor temporary files

## Implementation Plan

### ⚠️ PHASE 0: CRITICAL REPOSITORY CLEANUP (MUST BE DONE FIRST)

**Purpose**: Address repository hygiene issues that caused the previous attempt's rejection.

#### Step 1: Remove Tracked Binary Files
```bash
# Remove SQLite WAL file from git tracking
git rm --cached pipeline.db-wal

# Remove vim swap file from file system
rm docs/.PIPELINE-SPEC.md.swp

# Commit the cleanup
git add .gitignore
git commit -m "Clean up tracked binary files and improve gitignore

- Remove pipeline.db-wal from git tracking (SQLite WAL file)
- Delete vim swap file from docs/ directory  
- Add comprehensive gitignore patterns for editor temp files

Resolves repository hygiene issues for proper collaboration."
```

#### Step 2: Enhance .gitignore Protection
```bash
# Add to .gitignore (append these entries):
echo "" >> .gitignore
echo "# Editor temporary files" >> .gitignore
echo "*.swp" >> .gitignore
echo "*.swo" >> .gitignore
echo "*.tmp" >> .gitignore
echo ".*.swp" >> .gitignore
echo ".DS_Store" >> .gitignore
echo "Thumbs.db" >> .gitignore
```

#### Step 3: Verify Clean State
```bash
# Ensure no unintended files are tracked
git status --porcelain | grep -E "\.(wal|shm|swp|swo|tmp)$" || echo "✅ No binary/temp files tracked"

# Verify gitignore is working
touch test.swp
git status --porcelain test.swp || echo "✅ .swp files properly ignored"
rm test.swp
```

---

### PHASE 1: Fix API Response Format
**File**: `/src/routes/api/project-files/[project]/[...file]/+server.ts`

*Note: This technical approach was validated as excellent in the previous attempt.*

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
     const binaryExtensions = new Set([
       '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
       '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
       '.zip', '.tar', '.gz', '.rar', '.7z',
       '.exe', '.dll', '.so', '.dylib',
       '.mp3', '.wav', '.mp4', '.avi', '.mov', '.wmv',
       '.ttf', '.otf', '.woff', '.woff2'
     ]);
     
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

### PHASE 2: Fix Frontend Binary Handling
**File**: `/src/routes/docs/+page.svelte`

*Note: This frontend logic was validated as correct in the previous attempt.*

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

## Files to Modify

### 1. Repository Hygiene (CRITICAL FIRST STEP)
- **Command Line**: Git cleanup operations  
- **File**: `.gitignore` - Add comprehensive temp file patterns
- **Risk Level**: Low (cleanup operations)
- **Testing**: Verify git status is clean

### 2. `/src/routes/api/project-files/[project]/[...file]/+server.ts`
- **Changes**: Binary detection logic and response format
- **Risk Level**: Medium
- **Testing**: Unit tests for binary detection, API response format

### 3. `/src/routes/docs/+page.svelte`
- **Changes**: Error handling section (binary file detection)
- **Risk Level**: Low
- **Testing**: UI testing with various file types

## Acceptance Criteria

### 🚨 Repository Hygiene (BLOCKING - Must Pass)
- [ ] `git status --porcelain` shows no .wal, .shm, or .swp files
- [ ] `.gitignore` contains comprehensive temp file patterns
- [ ] `docs/.PIPELINE-SPEC.md.swp` file removed from file system
- [ ] `pipeline.db-wal` removed from git tracking but file can remain locally
- [ ] Verify with `git ls-files | grep -E "\.(wal|shm|swp|swo|tmp)$"` returns empty

### 🎯 Technical Functionality (All Must Pass)
- [ ] **AC1**: Text files (.md, .txt, .js, .ts, etc.) display content correctly  
- [ ] **AC2**: Binary files (.png, .pdf, .exe, etc.) show appropriate binary file message  
- [ ] **AC3**: Error messages clearly distinguish between binary files and read errors  
- [ ] **AC4**: File size and filename included in binary file messages  
- [ ] **AC5**: Large text files show truncation warnings when applicable  
- [ ] **AC6**: Empty files handle gracefully without binary detection  
- [ ] **AC7**: Permission errors don't trigger false binary detection  
- [ ] **AC8**: API responses include consistent `isBinary` field when applicable  
- [ ] **AC9**: Frontend error handling matches API response format  
- [ ] **AC10**: No regression in existing file browsing functionality  

### 🧪 Testing Validation
- [ ] Unit tests pass for binary detection logic
- [ ] Manual testing confirms text files display correctly
- [ ] Manual testing confirms binary files show proper error messages
- [ ] Git repository state is clean and professional

## Testing Approach

### Pre-Implementation Repository Validation
```bash
# Before starting technical work, verify clean state:
cd ~/projects/pipeline-dashboard-build

# Step 1: Confirm problematic files exist
ls -la pipeline.db-wal docs/.PIPELINE-SPEC.md.swp

# Step 2: Check git tracking status  
git ls-files | grep pipeline.db-wal

# Step 3: Execute cleanup
git rm --cached pipeline.db-wal
rm docs/.PIPELINE-SPEC.md.swp

# Step 4: Enhance .gitignore
echo -e "\n# Editor temporary files\n*.swp\n*.swo\n*.tmp\n.*.swp\n.DS_Store\nThumbs.db" >> .gitignore

# Step 5: Verify clean state
git status --porcelain | grep -E "\.(wal|shm|swp|swo|tmp)$" || echo "✅ Repository hygiene validated"
```

### Technical Testing (After Repository Cleanup)
1. **Binary detection function tests**:
   ```typescript
   describe('isBinaryFile', () => {
     it('should detect text files correctly', () => {
       // Test .md, .txt, .js files return false
     });
     
     it('should detect binary files by extension', () => {
       // Test .png, .jpg, .pdf files return true  
     });
     
     it('should detect binary files by null bytes', () => {
       // Test files with embedded null bytes return true
     });
     
     it('should handle empty files', () => {
       // Test zero-byte files return false
     });
     
     it('should handle permission errors gracefully', () => {
       // Test unreadable files return false (don't assume binary)
     });
   });
   ```

2. **API endpoint integration tests**:
   - Test response format consistency for binary vs text files
   - Verify `isBinary` field is properly set
   - Test error case handling

3. **Frontend UI tests**:
   - Navigate to docs page → select text file → verify content displays
   - Select binary file → verify proper error message shows
   - Verify file size and name in error messages

## Security & Performance Considerations

### Security (Unchanged from v1)
- ✅ Existing path traversal protection is adequate  
- ✅ No changes needed to authentication/authorization
- ✅ Error handling doesn't leak sensitive path information

### Performance Optimizations (Enhanced)
- ✅ Binary detection reads maximum 8KB for null byte check
- ✅ Uses `allocUnsafe` for better performance with small buffers  
- ✅ Early return for extension-based detection
- ✅ Proper buffer size management prevents memory waste

### Repository Health (New Requirement)
- ✅ Clean git history without committed temporary files
- ✅ Comprehensive .gitignore prevents future accidents
- ✅ Professional repository state suitable for team collaboration

## Rollback Plan

### If Repository Issues Arise:
1. **Emergency restore**: `git checkout HEAD~1 pipeline.db-wal` (if needed)
2. **Revert gitignore**: `git checkout HEAD~1 .gitignore`

### If Technical Issues Arise:
1. **Revert API changes**: Restore original binary detection logic
2. **Revert frontend changes**: Restore original error handling  
3. **Feature flag**: Add toggle to disable new binary detection temporarily

## Implementation Order (CRITICAL)

### 🔴 STEP 1: Repository Hygiene (MUST BE FIRST)
Execute all git cleanup commands and .gitignore improvements.  
**Verify**: `git status --porcelain` shows clean state.

### 🟡 STEP 2: Technical Implementation  
Proceed with API and frontend changes only after Step 1 is complete.

### 🟢 STEP 3: Testing & Validation
Run all tests and manual validation procedures.

## Success Metrics

### Repository Quality
- ✅ Zero binary/temporary files tracked in git
- ✅ Comprehensive .gitignore prevents future issues  
- ✅ Professional repository state ready for team collaboration

### Technical Quality  
- ✅ Binary file detection accuracy > 99%
- ✅ No false positives for common text file types
- ✅ Clear, helpful error messages for binary files
- ✅ Consistent API response format across all cases

---

**Spec Version**: v2  
**Date**: 2026-03-04  
**Author**: Scout Agent  
**Status**: Ready for Implementation  

**⚠️ CRITICAL REMINDER**: Repository hygiene cleanup MUST be completed before any technical changes. This was the blocking issue that caused v1's rejection despite excellent technical implementation.