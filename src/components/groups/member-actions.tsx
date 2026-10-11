"use client";

import { useState, useTransition } from "react";
import { Loader2, LogOut, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { deleteGroup, leaveGroup, removeMember } from "@/app/actions/groups";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionState } from "@/lib/types";

function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  run,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<ActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Thôi</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await run();
                if (result?.error) toast.error(result.error);
                else setOpen(false);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveMemberButton({
  groupId,
  userId,
  name,
}: {
  groupId: string;
  userId: string;
  name: string;
}) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Xóa ${name} khỏi nhóm`}>
          <UserMinus />
        </Button>
      }
      title={`Xóa ${name} khỏi nhóm?`}
      description="Bài đã làm của bạn ấy vẫn được giữ. Bạn ấy có thể vào lại bằng mã mời."
      confirmLabel="Xóa khỏi nhóm"
      run={() => removeMember(groupId, userId)}
    />
  );
}

export function LeaveGroupButton({ groupId }: { groupId: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="outline">
          <LogOut /> Rời nhóm
        </Button>
      }
      title="Rời nhóm này?"
      description="Bạn sẽ không còn nhận bộ đề ngày của nhóm. Có thể vào lại bằng mã mời."
      confirmLabel="Rời nhóm"
      run={() => leaveGroup(groupId)}
    />
  );
}

export function DeleteGroupButton({ groupId, name }: { groupId: string; name: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="destructive">
          <Trash2 /> Xóa nhóm
        </Button>
      }
      title={`Xóa nhóm "${name}"?`}
      description="Toàn bộ bộ đề ngày, bài làm và điểm của nhóm sẽ bị xóa vĩnh viễn. Không hoàn tác được."
      confirmLabel="Xóa vĩnh viễn"
      run={() => deleteGroup(groupId)}
    />
  );
}
