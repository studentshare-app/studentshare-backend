import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 9,
      steps: [
        addColumns({
          table: 'materials',
          columns: [
            { name: 'academic_year', type: 'string', isOptional: true },
            { name: 'is_premium',    type: 'boolean' },
            { name: 'content_text',  type: 'string', isOptional: true },
            { name: 'is_public',     type: 'boolean' },
            { name: 'uploader_id',   type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 10,
      steps: [
        addColumns({
          table: 'materials',
          columns: [
            { name: 'class_id',   type: 'string', isOptional: true },
            { name: 'college_id', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 11,
      steps: [
        addColumns({
          table: 'materials',
          columns: [
            { name: 'lecturer_name', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
