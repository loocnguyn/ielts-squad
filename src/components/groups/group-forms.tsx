"use client";

import { useActionState } from "react";
import { Loader2, LogIn, Plus } from "lucide-react";
import { createGroup, joinGroup } from "@/app/actions/groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateGroupForm() {
  const [state, action, pending] = useActionState(createGroup, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="group-name">Tên nhóm</Label>
        <Input id="group-name" name="name" required maxLength={60} placeholder="Ví dụ: Band 8 hay nghỉ chơi" />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />}
        Tạo nhóm
      </Button>
    </form>
  );
}

export function JoinGroupForm({ defaultCode = "" }: { defaultCode?: string }) {
  const [state, action, pending] = useActionState(joinGroup, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-code">Mã mời</Label>
        <Input
          id="invite-code"
          name="code"
          required
          minLength={6}
          maxLength={6}
          defaultValue={defaultCode}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="6 ký tự"
          className="font-mono tracking-[0.3em] uppercase placeholder:tracking-normal placeholder:normal-case"
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="secondary" className="h-10" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
        Vào nhóm
      </Button>
    </form>
  );
}
