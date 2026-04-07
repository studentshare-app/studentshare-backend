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
  ],
});
