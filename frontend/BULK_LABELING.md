# Bulk Email Labeling Feature

## Overview

The Bulk Email Labeling feature allows users to select multiple emails and label them as important or unimportant in bulk. This helps train the AI classifier to better understand user preferences.

## How it Works

### Frontend Integration

1. **Navigation**: Added "Bulk Label" to the main navigation menu
2. **Page Structure**: 
   - Two email pickers side by side (Important and Unimportant)
   - Selection summary showing counts
   - Progress indicator during processing
   - Success/error feedback

### API Integration

The feature uses the existing single email importance update endpoint (`PUT /api/emails/:id/importance`) to process emails one by one:

- **Important emails**: Set to `"important"`
- **Unimportant emails**: Set to `"not_important"`
- **Progress tracking**: Shows current/total emails being processed
- **Error handling**: Continues processing even if individual emails fail

### User Experience

1. **Email Selection**: Users can search and select emails using the existing EmailPicker component
2. **Batch Processing**: Emails are processed sequentially with a 100ms delay between requests
3. **Progress Feedback**: Real-time progress indicator shows current/total emails
4. **Confirmation**: Large batches (>50 emails) require user confirmation
5. **Results**: Success/error summary with counts of successful and failed updates

## Technical Details

### API Client Method

```typescript
async bulkLabel(
  data: { 
    user_id: string; 
    important_email_ids: string[]; 
    unimportant_email_ids: string[] 
  }, 
  onProgress?: (current: number, total: number) => void
)
```

### Response Format

```typescript
{
  data: {
    results: Array<{
      emailId: string;
      importance: "important" | "not_important";
      success: boolean;
      error?: string;
    }>
  }
}
```

### Error Handling

- Individual email failures don't stop the entire batch
- Failed emails are reported in the results
- Network errors are caught and reported
- User authentication is validated before processing

## Integration with Existing Systems

- **No backend changes required**: Uses existing email importance update endpoint
- **Consistent with existing patterns**: Follows the same UI/UX patterns as other pages
- **Reuses components**: Uses existing EmailPicker and UI components
- **Maintains data integrity**: Updates are processed through the same validation logic

## Future Enhancements

Potential improvements that could be made:

1. **Backend bulk endpoint**: Create a dedicated bulk update endpoint for better performance
2. **Batch size optimization**: Adjust delay between requests based on server capacity
3. **Retry logic**: Add retry mechanism for failed emails
4. **Undo functionality**: Allow users to revert bulk label changes
5. **Template-based labeling**: Save common labeling patterns for reuse
