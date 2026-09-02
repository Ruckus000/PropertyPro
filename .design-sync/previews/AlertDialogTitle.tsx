import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@propertypro/design-system';

export const QuestionTitle = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Close this violation case?</AlertDialogTitle>
        <AlertDialogDescription>
          Unit 0304 removed the walkway storage on 19 August. Closing the case
          stops further notices and no fine is assessed.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep open</AlertDialogCancel>
        <AlertDialogAction>Close case</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const LongWrappingTitle = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          Transfer the root manager role for Palm Shores HOA to Carlos Mendez?
        </AlertDialogTitle>
        <AlertDialogDescription>
          Only one root manager exists per community. You keep property manager
          access, but you can no longer assign roles, change billing or delete
          the community.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction>Transfer role</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
