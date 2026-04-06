

## Plan: Dynamic Stock Alert Level with Context-Aware Labels

### Overview
Update the Stock Alert Level section in AddProduct to show dynamic help text and placeholder based on product type. Verify Short Items page correctly uses the alert threshold.

### Changes

**1. Update `src/pages/AddProduct.tsx` — Stock Alert section (lines 249-263)**

- Add dynamic help text below the label:
  - Tablet/Capsule: *"Enter the minimum number of Pieces (e.g., 30) to get a low stock alert."*
  - Syrup/Injection/Cream: *"Enter the minimum number of Files/Units (e.g., 5) to get a low stock alert."*
  - No type selected: generic fallback text (current text)
- Update placeholder dynamically: `"Enter minimum pieces"` vs `"Enter minimum files"`
- Keep the `AlertTriangle` icon and existing styling
- Help text styled with `text-xs text-gray-500`

**2. Short Items integration — already correct**

The ShortItems page (line 43-44) already compares `stock_quantity` (total pieces) against `stock_alert` threshold and displays stock in tri-unit format. No changes needed there.

### Files Changed
1. `src/pages/AddProduct.tsx` — dynamic labels/placeholder in Stock Alert section

