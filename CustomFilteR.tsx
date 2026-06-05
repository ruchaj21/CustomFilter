import React, { useEffect, useRef, useReducer, useCallback, useState } from 'react';
import { find, compact } from 'lodash';
import { FilterBox, FilterChip, DatePicker, CheckboxGroup, MenuItem } from '@uwr/react-widgets';
import { useSavedSettings } from 'utils/useSavedUiStateSettings';
import { tRootState } from 'store/initialstate';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { setNotificationsFilter } from 'actions/notificationsFilter';
import { tDispatch } from 'actions/appActions';
import { tNotificationsFilter, FILTER } from 'model/NotificationsFilter';
import { useDynamicCallback } from 'components/app/useDynamicCallback';
import { bem } from 'components/grid/productsSentBem';
import { QuickFilters } from './components/app/QuickFilters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type tDateFilterValue = {
  value?: string;
  valueTo?: string;
};

type tLocalFilters = Partial<{
  [FILTER.DATE]: tDateFilterValue;
  [FILTER.PRODUCTS]: number[];
}>;

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const TYPE_CHANGE = 'change';
const TYPE_SET = 'set';

type tAction =
  | { type: typeof TYPE_CHANGE; field: string; value?: unknown }
  | { type: typeof TYPE_SET; value: tLocalFilters };

const EMPTY_FILTERS: tLocalFilters = {};

const valueReducer = (state: tLocalFilters, action: tAction): tLocalFilters => {
  switch (action.type) {
    case TYPE_CHANGE: {
      const newState = { ...state } as Record<string, unknown>;
      if (action.value === undefined) {
        delete newState[action.field];
      } else {
        newState[action.field] = action.value;
      }
      return newState as tLocalFilters;
    }
    case TYPE_SET:
      return action.value;
    default:
      return state;
  }
};

const deleteValueAction = (field: string): tAction => ({ type: TYPE_CHANGE, field });
const setValueAction = (field: string, value: unknown): tAction => ({ type: TYPE_CHANGE, field, value });
const resetValuesAction = (value: tLocalFilters = EMPTY_FILTERS): tAction => ({ type: TYPE_SET, value });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildReduxFilter = (
  currentFilter: tNotificationsFilter,
  localFilters: tLocalFilters,
): tNotificationsFilter => {
  const dateUi = localFilters[FILTER.DATE];
  const date: tNotificationsFilter[typeof FILTER.DATE] = dateUi?.value
    ? { from: dateUi.value, to: dateUi.valueTo ?? dateUi.value }
    : undefined;

  const products = localFilters[FILTER.PRODUCTS];

  return { ...currentFilter, date, products };
};

const restoreFromSaved = (saved: unknown[]): tLocalFilters => {
  if (!Array.isArray(saved) || !saved.length) return EMPTY_FILTERS;

  const result: tLocalFilters = {};

  const dateEntry = find(saved, { key: FILTER.DATE }) as (tDateFilterValue & { key: string }) | undefined;
  if (dateEntry?.value) {
    result[FILTER.DATE] = { value: dateEntry.value, valueTo: dateEntry.valueTo };
  }

  const productsEntry = find(saved, { key: FILTER.PRODUCTS }) as { key: string; value?: number[] } | undefined;
  if (productsEntry?.value?.length) {
    result[FILTER.PRODUCTS] = productsEntry.value;
  }

  return result;
};

const NOOP = () => {};

// ---------------------------------------------------------------------------
// DateRangeChip
// ---------------------------------------------------------------------------

const DateRangeChip: React.FC<{
  field: string;
  value: tDateFilterValue;
  dispatch: React.Dispatch<tAction>;
}> = ({ field, value, dispatch }) => {
  const [localFrom, setLocalFrom] = useState(value?.value ?? '');
  const [localTo, setLocalTo] = useState(value?.valueTo ?? '');

  // Sync local state when parent value changes (e.g. on reset)
  useEffect(() => {
    setLocalFrom(value?.value ?? '');
    setLocalTo(value?.valueTo ?? '');
  }, [value?.value, value?.valueTo]);

  const handleApply = useCallback(() => {
    if (localFrom) {
      dispatch(setValueAction(field, { value: localFrom, valueTo: localTo || localFrom }));
    } else {
      dispatch(deleteValueAction(field));
    }
  }, [field, localFrom, localTo, dispatch]);

  const handleDelete = useCallback(() => {
    dispatch(deleteValueAction(field));
  }, [field, dispatch]);

  const displayLabel = (() => {
    const parts = compact([value?.value, value?.valueTo]);
    return parts.length ? parts.join(' – ') : undefined;
  })();

  return (
    <FilterChip
      id={`filter-chip-${field}`}
      label="Date"
      value={displayLabel}
      type="custom"
      onClose={handleDelete}
    >
      <FilterChip.PopoverContent
        onApply={handleApply}
        onReset={displayLabel ? handleDelete : NOOP}
        resetButtonText="Cancel"
        applyButtonText="Apply"
      >
        <DatePicker
          id="filter-date-from"
          name="filter-date-from"
          label="From"
          value={localFrom}
          dateFormat={DatePicker.generateDateFormat('en')}
          style={{ marginBottom: '8px' }}
          calendarButtonProps={{
            'aria-label': localFrom
              ? `Selected date is ${localFrom}. Choose date`
              : 'Choose date',
          }}
          onChange={({ target: { value: v } }: { target: { value: string } }) =>
            setLocalFrom(v)
          }
        />
        <DatePicker
          id="filter-date-to"
          name="filter-date-to"
          label="To"
          value={localTo}
          dateFormat={DatePicker.generateDateFormat('en')}
          calendarButtonProps={{
            'aria-label': localTo
              ? `Selected date is ${localTo}. Choose date`
              : 'Choose date',
          }}
          onChange={({ target: { value: v } }: { target: { value: string } }) =>
            setLocalTo(v)
          }
        />
      </FilterChip.PopoverContent>
    </FilterChip>
  );
};

// ---------------------------------------------------------------------------
// ProductsChip
// ---------------------------------------------------------------------------

const ProductsChip: React.FC<{
  field: string;
  value: number[];
  options: { label: string; value: number }[];
  dispatch: React.Dispatch<tAction>;
}> = ({ field, value, options, dispatch }) => {
  const [localValue, setLocalValue] = useState<Set<number>>(() => new Set(value));

  // Sync when parent value changes (e.g. on reset)
  useEffect(() => {
    setLocalValue(new Set(value));
  }, [value]);

  const checkboxes = options.map(({ label, value: optVal }) => ({
    id: `filter-products-${optVal}`,
    label,
    checked: localValue.has(optVal),
  }));

  const handleChange = useCallback(
    ({ id, checked }: { id: string; checked: boolean }) => {
      const numId = Number(id.replace('filter-products-', ''));
      setLocalValue((prev) => {
        const next = new Set(prev);
        checked ? next.add(numId) : next.delete(numId);
        return next;
      });
    },
    [],
  );

  const handleApply = useCallback(() => {
    const selected = Array.from(localValue);
    if (selected.length) {
      dispatch(setValueAction(field, selected));
    } else {
      dispatch(deleteValueAction(field));
    }
  }, [field, localValue, dispatch]);

  const handleDelete = useCallback(() => {
    dispatch(deleteValueAction(field));
  }, [field, dispatch]);

  const displayLabel = value.length ? `${value.length} selected` : undefined;

  return (
    <FilterChip
      id={`filter-chip-${field}`}
      label="Products"
      value={displayLabel}
      type="custom"
      onClose={handleDelete}
    >
      <FilterChip.PopoverContent
        onApply={handleApply}
        onReset={displayLabel ? handleDelete : NOOP}
        resetButtonText="Cancel"
        applyButtonText="Apply"
      >
        <CheckboxGroup
          id="filter-products-group"
          checkBoxes={checkboxes}
          alignment="vertical"
          groupLabelTagName="h3"
          onChange={handleChange}
        />
      </FilterChip.PopoverContent>
    </FilterChip>
  );
};

// ---------------------------------------------------------------------------
// Redux selector
// ---------------------------------------------------------------------------

const selector = (state: tRootState) => ({
  productsConfig: state.api.notificationsProductsConfig as { label: string; value: number }[],
  currentFilter: state.notifications.filter as tNotificationsFilter,
  connected: state.api.connectedToProductsSent as boolean,
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ALL_FILTER_FIELDS = [FILTER.DATE, FILTER.PRODUCTS] as const;

const FILTER_LABELS: Record<string, string> = {
  [FILTER.DATE]: 'Date',
  [FILTER.PRODUCTS]: 'Products',
};

const FILTER_DEFAULTS: Record<string, unknown> = {
  [FILTER.DATE]: {} as tDateFilterValue,
  [FILTER.PRODUCTS]: [] as number[],
};

export const ProductsSentFilter: React.FC = () => {
  const reduxDispatch: tDispatch = useDispatch();
  const [savedValue, saveValue] = useSavedSettings<unknown[]>('notifications-query') ?? [];

  const { currentFilter, productsConfig, connected } = useSelector(selector, shallowEqual);

  const initFilters: tLocalFilters = restoreFromSaved(savedValue ?? []);
  const [values, dispatchValueChange] = useReducer(valueReducer, initFilters);

  const isLoaded = useRef(false);

  // ---- Persist + push to redux on every local change ---------------------

  const syncToRedux = useCallback(
    (localFilters: tLocalFilters) => {
      const legacyFormat: unknown[] = [];
      if (localFilters[FILTER.DATE]?.value) {
        legacyFormat.push({
          key: FILTER.DATE,
          value: localFilters[FILTER.DATE]!.value,
          valueTo: localFilters[FILTER.DATE]!.valueTo,
        });
      }
      if ((localFilters[FILTER.PRODUCTS] as number[] | undefined)?.length) {
        legacyFormat.push({ key: FILTER.PRODUCTS, value: localFilters[FILTER.PRODUCTS] });
      }
      saveValue(legacyFormat);
      reduxDispatch(setNotificationsFilter(buildReduxFilter(currentFilter, localFilters)));
    },
    [currentFilter, reduxDispatch, saveValue],
  );

  // ---- Load saved filters once connected ---------------------------------

  const loadFilters = useDynamicCallback(() => {
    if (!!connected && !isLoaded.current) {
      isLoaded.current = true;
      reduxDispatch(setNotificationsFilter(buildReduxFilter(currentFilter, values)));
    } else {
      setTimeout(loadFilters, 1000);
    }
  });

  useEffect(() => {
    setTimeout(loadFilters, 1000);
  }, [loadFilters]);

  // ---- Sync on values change (skip first render) -------------------------

  const prevValuesRef = useRef(values);
  useEffect(() => {
    if (prevValuesRef.current !== values) {
      prevValuesRef.current = values;
      syncToRedux(values);
    }
  }, [values, syncToRedux]);

  // ---- FilterBox plumbing ------------------------------------------------

  const usedFilters = Object.keys(values) as string[];
  const availableFilters = ALL_FILTER_FIELDS.filter((f) => !usedFilters.includes(f));

  // FIX: capture field immediately from the MenuItem's data-field attribute
  // using a closure per field — avoids synthetic event nullification and
  // avoids relying on currentTarget being available asynchronously.
  const handleFilterClick = useCallback(
    ({ currentTarget }: React.MouseEvent<HTMLElement>) => {
      // Capture field synchronously before event is recycled
      const field = currentTarget.getAttribute('data-field');
      if (!field) return;
      dispatchValueChange(setValueAction(field, FILTER_DEFAULTS[field]));
    },
    [],
  );

  const hasFilters = usedFilters.length > 0;

  const handleUndoButtonClick = useCallback(
    () => dispatchValueChange(resetValuesAction(initFilters)),
    [initFilters],
  );

  const handleClearButtonClick = hasFilters
    ? () => dispatchValueChange(resetValuesAction())
    : undefined;

  // MenuItem list — only fields not yet active
  const filterMenuItems = availableFilters.map((field) => (
    <MenuItem key={field} data-field={field}>
      {FILTER_LABELS[field]}
    </MenuItem>
  ));

  // Active filter chips
  const filterChips = usedFilters.map((field) => {
    if (field === FILTER.DATE) {
      return (
        <DateRangeChip
          key={field}
          field={field}
          value={(values[FILTER.DATE] as tDateFilterValue) ?? {}}
          dispatch={dispatchValueChange}
        />
      );
    }
    if (field === FILTER.PRODUCTS) {
      return (
        <ProductsChip
          key={field}
          field={field}
          value={(values[FILTER.PRODUCTS] as number[]) ?? []}
          options={productsConfig ?? []}
          dispatch={dispatchValueChange}
        />
      );
    }
    return null;
  });

  // ---- Render ------------------------------------------------------------

  return (
    <section
      className={bem({
        extra: 'section mt-3 p-2 d-flex justify-content-start align-items-end',
      })}
    >
      <QuickFilters type="default" />
      <FilterBox
        filterItems={filterMenuItems}
        onFilterClick={handleFilterClick}
        onUndoButtonClick={handleUndoButtonClick}
        onClearButtonClick={handleClearButtonClick}
        filterButtonProps={{ buttonContent: 'Filter', label: 'Filter' }}
      >
        {hasFilters ? filterChips : 'Apply filter from the menu'}
      </FilterBox>
    </section>
  );
};

export default ProductsSentFilter;
