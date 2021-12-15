export const BadgeRed = (props: { children: any }) =>
  props.children ? (
    <span class="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">
      {props.children}
    </span>
  ) : null;

export const BadgeBlue = (props: { children: any }) =>
  props.children ? (
    <span class="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-blue-600 rounded-full">
      {props.children}
    </span>
  ) : null;
