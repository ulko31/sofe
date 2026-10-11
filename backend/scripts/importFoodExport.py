"""Import an OFF TSV export into a server-only catalogue. No network or production DB writes.
Usage: python3 backend/scripts/importFoodExport.py export.tsv
Only complete, plausible per-100g records are imported; every record retains provenance.
"""
import csv, json, math, sys
from datetime import date
from pathlib import Path

def number(value):
    try:
        result=float(str(value).replace(',', '.'))
        return result if math.isfinite(result) and result >= 0 else None
    except (ValueError, TypeError): return None

def convert(row):
    code=str(row.get('code', '')).strip()
    name=(row.get('product_name_ru') or row.get('product_name') or '').strip()
    values={k:number(row.get(k+'_100g')) for k in ['proteins','fat','carbohydrates']}
    energy=number(row.get('energy-kcal_100g'))
    if energy is None:
        kj=number(row.get('energy-kj_100g') or row.get('energy_100g'))
        if kj is not None: energy=kj/4.184
    if not code.isdigit() or len(code) not in [8,12,13,14] or not name or energy is None or any(v is None for v in values.values()): return None
    if energy>1000 or any(v>100 for v in values.values()) or sum(values.values())>105: return None
    return dict(id='off_'+code,barcode=code,name=name,brand=(row.get('brands') or '').split(',')[0].strip(),
        calories=round(energy),protein=values['proteins'],fat=values['fat'],carbs=values['carbohydrates'],
        unit='100г',unit_weight=100,source='openfoodfacts',source_url='https://world.openfoodfacts.org/product/'+code,
        checked_at=date.today().isoformat(),nutrition_complete=True)

def main():
    root=Path(__file__).resolve().parents[1]
    target=root/'data/brandedFoods.json'
    rows={r['id']:r for r in json.loads(target.read_text())} if target.exists() else {}
    imported=skipped=0
    with open(sys.argv[1],encoding='utf-8-sig',newline='') as file:
        reader=csv.DictReader(file,delimiter='\t')
        if 'code' not in (reader.fieldnames or []): raise ValueError('Not an Open Food Facts TSV export')
        for row in reader:
            item=convert(row)
            if item: rows[item['id']]=item;imported+=1
            else: skipped+=1
    target.parent.mkdir(parents=True,exist_ok=True)
    temp=target.with_suffix('.tmp')
    temp.write_text(json.dumps(list(rows.values()),ensure_ascii=False,separators=(',',':'))+'\n')
    temp.replace(target)
    print(json.dumps(dict(imported=imported,skipped=skipped,total=len(rows))))
if __name__=='__main__': main()
