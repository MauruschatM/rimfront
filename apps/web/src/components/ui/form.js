"use client";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { Controller, FormProvider, useFormContext, } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
const Form = FormProvider;
const FormFieldContext = React.createContext({});
const FormField = ({ ...props }) => {
    return (<FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props}/>
    </FormFieldContext.Provider>);
};
const useFormField = () => {
    const fieldContext = React.useContext(FormFieldContext);
    const itemContext = React.useContext(FormItemContext);
    const { getFieldState, formState } = useFormContext();
    const fieldState = getFieldState(fieldContext.name, formState);
    if (!fieldContext) {
        throw new Error("useFormField should be used within <FormField>");
    }
    const { id } = itemContext;
    return {
        id,
        name: fieldContext.name,
        formItemId: `${id}-form-item`,
        formDescriptionId: `${id}-form-item-description`,
        formMessageId: `${id}-form-item-message`,
        ...fieldState,
    };
};
const FormItemContext = React.createContext({});
const FormItem = React.forwardRef(({ className, ...props }, ref) => {
    const id = React.useId();
    return (<FormItemContext.Provider value={{ id }}>
      <div className={cn("space-y-2", className)} ref={ref} {...props}/>
    </FormItemContext.Provider>);
});
FormItem.displayName = "FormItem";
const FormLabel = React.forwardRef(({ className, ...props }, ref) => {
    const { error, formItemId } = useFormField();
    return (<Label className={cn(error && "text-destructive", className)} htmlFor={formItemId} ref={ref} {...props}/>);
});
FormLabel.displayName = "FormLabel";
const FormControl = React.forwardRef(({ ...props }, ref) => {
    const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
    return (<Slot aria-describedby={error ? `${formDescriptionId} ${formMessageId}` : `${formDescriptionId}`} aria-invalid={!!error} id={formItemId} ref={ref} {...props}/>);
});
FormControl.displayName = "FormControl";
const FormDescription = React.forwardRef(({ className, ...props }, ref) => {
    const { formDescriptionId } = useFormField();
    return (<p className={cn("text-muted-foreground text-sm", className)} id={formDescriptionId} ref={ref} {...props}/>);
});
FormDescription.displayName = "FormDescription";
const FormMessage = React.forwardRef(({ className, children, ...props }, ref) => {
    const { error, formMessageId } = useFormField();
    const body = error ? String(error?.message) : children;
    if (!body) {
        return null;
    }
    return (<p className={cn("font-medium text-destructive text-sm", className)} id={formMessageId} ref={ref} {...props}>
      {body}
    </p>);
});
FormMessage.displayName = "FormMessage";
export { useFormField, Form, FormItem, FormLabel, FormControl, FormDescription, FormMessage, FormField, };
