import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useBatchStore } from '@/state/batchStore';

export function BatchSettings() {
  const settings = useBatchStore((s) => s.settings);
  const setSettings = useBatchStore((s) => s.setSettings);

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-md border bg-background px-4 py-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="batch-use-ocr"
          checked={settings.useOcr}
          onCheckedChange={(checked) => setSettings({ useOcr: checked === true })}
        />
        <Label htmlFor="batch-use-ocr">OCR 사용</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="batch-auto-ner"
          checked={settings.autoApplyNer}
          onCheckedChange={(checked) => setSettings({ autoApplyNer: checked === true })}
        />
        <Label htmlFor="batch-auto-ner">NER 후보도 자동 적용</Label>
      </div>
    </div>
  );
}
